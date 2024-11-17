const express = require('express')
const multer = require('multer')
const fs = require('fs')
const { exec } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { transliterate } = require('transliteration');
const Sanscript = require("@indic-transliteration/sanscript")
const slug = require('slug');
const OpenAI = require('openai');
const { getFirestore, doc, setDoc, getDoc, updateDoc } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const AWS = require('aws-sdk');
const temp = require('temp');
const { BlobServiceClient } = require('@azure/storage-blob');
const streamifier = require('streamifier');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const crypto = require("crypto");
const { Cashfree } = require("cashfree-pg");
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI,
});

var serviceAccount = require("./caps-85254-firebase-adminsdk-31j3r-0edeb4bd98.json");


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const cron = require('node-cron');

const db = getFirestore();


const app = express();
app.use(cors());
app.use(express.json());



Cashfree.XClientId = process.env.CASHFREE_APPID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRETKEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;



const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORE);
const containerClient = blobServiceClient.getContainerClient('capsuservideos');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});


const upload = multer({ storage: storage });


async function uploadToAzure(filePath) {
    const blobName = path.basename(filePath);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const uploadBlobResponse = await blockBlobClient.uploadFile(filePath);
    return {
        url: blockBlobClient.url,
        blobName,
    };
}

// Helper function to delete file from Azure Blob Storage
async function deleteFromAzure(containerName, blobName) {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.delete();
    console.log(`Blob ${blobName} successfully deleted from container ${containerName}`);
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ai.editor@capsai.co',
        pass: process.env.EMAIL_KEY
    }
});



app.post('/api/process-video', upload.single('video'), async (req, res) => {
    try {
        console.log(req)
        const videoPath = req.file.path;
        const language = req.body.SelectedLang;
        const isoneWord = req.body.WordLimit === 'true';
        // const uid = req.body.uid;
        // const userdata = JSON.parse(req.body.userdata)
        // console.log(userdata.usertype, uid);
        console.log(isoneWord, "from front");
        let remaningmins = 0;
        const outputPath = `${videoPath}_output.mp4`;
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');

        const transcription = await transcribeVideo(videoPath, isoneWord);
        console.log(transcription, "process wali")

        let srtContent

        if (isoneWord) {
            srtContent = generateSRTSimple(transcription.words)
        } else {
            console.log("Ran");
            srtContent = processTranscriptionToSRT(transcription.segments, 4);
        }

        console.log(srtContent)
        let outputSrt;


        const directLanguages = ["English", "Hindi"];
        const supportedLanguages = ["Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Punjabi"];


        if (directLanguages.includes(language) && transcription.language.toLowerCase() === language.toLowerCase()) {
            outputSrt = srtContent;
        } else if (supportedLanguages.includes(language)) {
            outputSrt = srtContent;
        } else {
            outputSrt = await convertHindiToHinglish(srtContent, language);
        }



        const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename.replace('.mp4', '')}.srt`);
        fs.writeFileSync(srtFilePath, outputSrt);

        /* const videoDuration = await getVideoDuration(videoPath);
        console.log(videoDuration);

        if (userdata.usertype === 'free') {
            if (videoDuration > 3) {
                return res.status(400).json({ error: 'Video length exceeds 3 minutes limit for free users' });
            }
            else {
                console.log(userdata.videomins, 'user mins');
                console.log(videoDuration, 'dur');
                remaningmins = userdata.videomins - videoDuration;
                console.log(remaningmins);
            }
        } else {
            remaningmins = userdata.videomins - videoDuration;
        } */



        // Upload video and SRT to azure

        const videoUpload = await uploadToAzure(videoPath);
        const srtUpload = await uploadToAzure(srtFilePath);
        console.log(videoUpload, srtUpload)

        // const userRef = db.collection('users').doc(uid);
        // let exact;
        // if (remaningmins <= 0) {
        //     exact = 0;
        // } else {
        //     exact = remaningmins.toFixed(1);
        // }

        // console.log(exact, "rounded")
        // await userRef.update({
        //     videomins: exact,
        // });

        fs.unlinkSync(videoPath);
        fs.unlinkSync(srtFilePath);


        res.json({
            transcription: formatSubtitle(outputSrt),
            rawData: transcription.words,
            inputFile: videoUpload.url,
            lang: transcription.language,
            key: videoUpload.blobName,
            srt: srtUpload.url,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/change-style', upload.single('video'), async (req, res) => {
    try {
        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, keyS3, transcriptions, isOneword, videoResolution } = req.body;

        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');
        const videoPath = inputVideo;
        const srtFilePath = path.join(__dirname, 'uploads', `${path.basename(srtUrl)}`);
        const srtResponse = await axios.get(srtUrl);
        fs.writeFileSync(srtFilePath, srtResponse.data);
        const srtContent = generateSRT(transcriptions);
        let assContent = isOneword ? convertSrtToAssWordByWord(srtContent, font, color, yPosition) : convertSrtToAssWordByWord(srtContent, font, color, yPosition, 4);
        const assFilePath = path.join(__dirname, 'uploads', 'subtitles.ass');
        fs.writeFileSync(assFilePath, assContent);
        const tempOutputPath = temp.path({ suffix: '.mp4' });


        let remaningmins = 0;

        // Check video length and user type
        let ffmpegCommand;

        // const outputFilePath = await downloadVideo(videoPath);
        const outputFilePath = path.join(__dirname, 'uploads', path.basename(videoPath).replace('.mp4', '_output.mp4'));
        await new Promise((resolve, reject) => {
            if (userdata.usertype === 'free') {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg -i ${videoPath} -i ${watermarkPath} -filter_complex "[1:v]scale=203.2:94.832[watermark]; [0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setdar=16/9[scaled]; [scaled][watermark]overlay=158:301,ass=${assFilePath}" -c:a copy ${outputFilePath}`;
                } else {
                    ffmpegCommand = `ffmpeg -i ${videoPath} -i ${watermarkPath} -filter_complex "[1:v] scale=203.2:94.832 [watermark]; [0:v][watermark] overlay=158:301, ass=${assFilePath}" -c:a copy ${outputFilePath}`;
                }
            } else {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg -i ${videoPath} -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setdar=16/9,ass=${assFilePath}" -c:a copy ${outputFilePath}`;
                } else {
                    ffmpegCommand = `ffmpeg -i ${videoPath} -vf "ass=${assFilePath}" -c:a copy ${outputFilePath}`
                }

            }
            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        let outputUpload
        let outputVideoUrl



        if (save) {

            // Upload output video to S3
            // outputUpload = await uploadToS3(outputFilePath, 'capsuservideos');
            // outputVideoUrl = outputUpload.Location;
            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;
            // Schedule deletion based on user type
            if (userdata.usertype === 'free') {
                scheduleFileDeletion('capsuservideos', keyS3, 5)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 2);
            } else {
                scheduleFileDeletion('capsuservideos', keyS3, 2)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 2);
            }

            // Delete the input video
            // await deleteFromS3(videoPath, 'capsuservideos');

            const videos = userdata.videos || [];


            const newDocRef = await db.collection('users').doc(uid).collection('videos').add({
                videoUrl: videoPath,
                srt: srtUrl,
                fontadded: font,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                key: keyS3,
                transcriptions: transcriptions
            });
            const docId = newDocRef.id;
            const docPath = `users/${uid}/videos`
            if (userdata.usertype === 'free') {
                scheduleDocumentDeletion(docPath, docId, 2)
            } else {
                scheduleDocumentDeletion(docPath, docId, 3)
            }

        } else {

            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;

            scheduleFileDeletion('capsuservideos', outputUpload.blobName, 1);

            scheduleFileDeletion('capsuservideos', keyS3, 6)


            // await deleteFromS3(videoPath, 'capsuservideos');
        }


        const videoDuration = await getVideoDuration(videoPath);


        if (userdata.usertype === 'free') {
            if (videoDuration > 3) {
                return res.status(400).json({ error: 'Video length exceeds 3 minutes limit for free users' });
            }
            else {
                console.log(userdata.videomins, 'user mins');
                console.log(videoDuration, 'dur');
                remaningmins = userdata.videomins - videoDuration;
                console.log(remaningmins);
            }
        } else {
            remaningmins = userdata.videomins - videoDuration;
        }

        const userRef = db.collection('users').doc(uid);
        let exact;
        if (remaningmins <= 0) {
            exact = 0;
        } else {
            exact = remaningmins.toFixed(1);
        }

        console.log(exact, "rounded")
        await userRef.update({
            videomins: exact,
        });


        fs.unlinkSync(srtFilePath)
        fs.unlinkSync(assFilePath)
        fs.unlinkSync(outputFilePath)

        res.json({ videoUrl: outputVideoUrl });
    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }
});



app.get("/api/payment", async (req, res) => {
    console.log('its in payment')
    try {
        const orderAmount = req.query.order_amount || 0;
        const customer_id = req.query.customer_id;
        const customer_name = req.query.customer_name;
        const customer_email = req.query.customer_email;
        console.log(orderAmount, customer_id, customer_name, customer_email)
        let request = {
            order_amount: orderAmount,
            order_currency: "INR",
            order_id: generateOrderId(),
            customer_details: {
                customer_id: customer_id,
                customer_name: customer_name,
                customer_email: customer_email,
                customer_phone: "9999999999"
            },
        };

        Cashfree.PGCreateOrder("2023-08-01", request)
            .then((response) => {
                console.log(response.data);
                res.json(response.data);
            })
            .catch((error) => {
                console.error(error.response.data.message);
            });
    } catch (error) {
        console.log(error);
    }
});

app.post("/api/verify", async (req, res) => {
    console.log(req.body);
    try {
        let { orderId } = req.body;
        console.log(orderId, 'verify mei')

        Cashfree.PGOrderFetchPayments("2023-08-01", orderId)
            .then((response) => {
                res.json(response.data);
            })
            .catch((error) => {
                console.error(error.response.data.message);
            });
    } catch (error) {
        console.log(error);
    }
});



app.post("/api/send-welcome-email", (req, res) => {
    const { email, userName } = req.body;

    const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: 'Welcome to Capsai',
        html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to CapsAI</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
              }
              .email-container {
                  max-width: 600px;
                  margin: auto;
                  background-color: #ffffff;
                  padding: 0;
                  border-radius: 10px;
                  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
              }
              .header {
                  background-color: #0073e6;
                  text-align: center;
                  padding: 20px;
              }
              .header img {
                  width: 150px;
              }
              .banner {
                  width: 100%;
                  height: auto;
              }
              .content {
                  padding: 20px;
                  text-align: left;
                  line-height: 1.6;
              }
              .content h1 {
                  color: #333333;
              }
              .content p {
                  color: #666666;
              }
              .features {
                  display: flex;
                  justify-content: space-between;
                  padding: 20px 0;
              }
              .feature {
                  width: 30%;
                  text-align: center;
              }
              .feature img {
                  width: 100%;
                  border-radius: 10px;
              }
              .footer {
                  text-align: center;
                  padding: 10px;
                  font-size: 12px;
                  color: #999999;
              }
              .footer a {
                  color: #1e90ff;
                  text-decoration: none;
              }
          </style>
      </head>
      <body>
          <div class="email-container">
             
                   <img src="https://capsaistore.blob.core.windows.net/capsaiassets/Welcome_banner.png" alt="Welcome Banner" class="banner">
            
            <div class="content">
                
                <p>Hi ${userName},</p>
                <p>We’re thrilled to welcome you to the CapsAI community!</p>
                <p>CapsAI is designed to make your life easier by automating the subtitle generation process and providing access to a wide range of premium fonts. Whether you're a seasoned creator or just starting out, CapsAI has the tools you need to elevate your content.</p>
                <p>What You Can Do with CapsAI:</p>
                <ul>
                    <li>😊 <strong>Generate subtitles automatically:</strong> Streamline your workflow.</li>
                    <li>🛠️ <strong>Customize with premium fonts:</strong> Make your videos stand out.</li>
                    <li>✨ <strong>Access intuitive tools:</strong> Designed for creators of all levels.</li>
                </ul>
                <p>Ready to unlock all the features? <a href="https://capsai.co/pricing" target="_blank" style="color: #1e90ff; text-decoration: none;">Subscribe now</a> and experience everything CapsAI has to offer.</p>
                <p>If you ever have questions or need assistance, please don't hesitate to reach out. Enjoy your CapsAI experience!</p>
                <p>Warm regards,<br>Team CapsAI</p>
            </div>
            <div class="footer">
                <p>&copy; 2024 CapsAI. All rights reserved.</p>
                <p><a href="https://capsai.co/">Unsubscribe</a></p>
            </div>
          </div>
      </body>
      </html>
    `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.status(200).send('Email sent successfully');
        }
    });
});


app.post("/api/creds-refuel", (req, res) => {
    const { email, userName } = req.body;

    const mailOptions = {
        from: '"Capsai" <ai.editor@capsai.co>',
        to: email,
        subject: 'Refuel Your Minutes-Plans Starting at ₹29',
        html: `
    <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CapsAI Pricing Plans</title>
<link rel="stylesheet" href="styles.css">
<style>
body, html {
    margin: 0;
    padding: 16;
    font-family: Arial, sans-serif;
    background: #ffffff;
    color: #333;
}

.email-container {
    width: 100%;
    max-width: 600px;
    margin: auto;
    background: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    
}
header {
    background-image: url('https://res.cloudinary.com/dykfhce2b/image/upload/v1726401709/Line_jplj8n.png');
    padding: 40px;
   
    text-align: center;
    color: black;
}

header h1 {
    margin-inline:50px;
}
header p {
 
  margin-block: 30px;
}

.social-preview img {
    width: 100%;
}

.content {
    padding: 20px;
    line-height: 1.6;
}

.pricing ul, .details ul {
    list-style: none;
    padding: 0;
}

.pricing li, .details li {
    background: #f4f4f9;
    margin: 10px 0;
    padding: 10px;
    border-radius: 4px;
}

.btn-explore {
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    
    cursor: pointer;
    border-radius: 5px;
    text-decoration: none;
}

button:hover {
    background: #0056b3;
}

footer {
    padding: 20px;
    text-align: left;
    font-size: 0.85em;
}

.social-icons img {
    width: 24px;
    margin: 0 5px;
}

.footer-links a {
    color: #007bff;
    text-decoration: none;
    margin-right: 10px;
}

 </style>
</head>
<body>
<div class="email-container">
    <a href="https://capsai.co/pricing" target="_blank"><img src="https://capsaistore.blob.core.windows.net/capsaiassets/refuel.png" alt="Welcome Banner" class="banner"></a>
    <section class="content">
         <div class="email-content">
            <p>Hi ${userName},</p>
            <p>🎉 Tailored Pricing Plans Just for You! 🎉</p>
            <p>Whether you're just starting out or you're a seasoned content creator, we have a plan that's perfect for you.</p>
            <p>Here's what you can expect:</p>
            <ul>
                <li>Affordable Plans: Starting at just Rs 29</li>
                <li>Flexible Validity: Subtitle your content at your own pace</li>
                <li>Tailored Minutes: Plans that match your content needs</li>
            </ul>
            <p>Check out the details below and find the plan that’s right for you:</p>
            <ul class="pricing-list">
                <li>Rs 29 Plan: 20 minutes, 20 days validity</li>
                <li>Rs 99 Plan: 70 minutes, 30 days validity</li>
                <li>Rs 199 Plan: 150 minutes, 45 days validity</li>
            </ul>
            <p>✨ Don’t miss out on making your content shine with perfect subtitles! Start Subtitling Today!</p>
            <a href="https://capsai.co/pricing" class="btn-explore">Explore now</a>
        </div>
    </section>
    <footer>
        <p>Cheers,</p>
        <p>The Capsai Team</p>
        <!--<div class="social-icons">-->
        <!--    <img src="icon-x.png" alt="Social X">-->
        <!--    <img src="icon-linkedin.png" alt="LinkedIn">-->
        <!--    <img src="icon-instagram.png" alt="Instagram">-->
        <!--</div>-->
        <!--<div class="footer-links">-->
        <!--    <a href="#">Unsubscribe</a>-->
        <!--    <a href="#">Terms Privacy</a>-->
        <!--    <a href="#">About us</a>-->
        <!--</div>-->
    </footer>
</div>
</body>
</html>
    `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.status(200).send('Email sent successfully');
        }
    });
});






function generateSRT(words) {
    let srt = '';
    words.forEach((el, index) => {
        srt += `${index + 1}\n`;
        srt += `${el.timeStart} --> ${el.timeEnd}\n`;
        srt += `${el.value}\n\n`;
    });
    return srt;
}


function formatSubtitle(text) {
    const entries = text.trim().split('\n\n');
    const result = [];

    entries.forEach(entry => {
        const lines = entry.split('\n');
        const idLine = lines[0].trim();
        const timeLine = lines[1].trim();
        const valueLine = lines.slice(2).join(' ').trim();

        const idValue = parseInt(idLine);
        const [timeStart, timeEnd] = timeLine.match(/\d{2}:\d{2}:\d{2},\d{3}/g);

        const totalDuration = parseTimecode(timeEnd) - parseTimecode(timeStart);

        // Treat the entire valueLine as a single unit
        const wordTimeStart = parseTimecode(timeStart);
        const wordTimeEnd = parseTimecode(timeEnd);

        const formattedEntry = {
            id: `${idValue}-1`,
            timeStart: formatTimecode(wordTimeStart),
            timeEnd: formatTimecode(wordTimeEnd),
            value: valueLine,
        };
        result.push(formattedEntry);
    });

    return result;
}

function parseTimecode(timecode) {
    const [hours, minutes, seconds] = timecode.split(':');
    const [secs, millis] = seconds.split(',');
    return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs)) * 1000 + parseInt(millis);
}

function formatTimecode(milliseconds) {
    const hours = Math.floor(milliseconds / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((milliseconds % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((milliseconds % 60000) / 1000).toString().padStart(2, '0');
    const millis = (milliseconds % 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${millis}`;
}

async function transcribeVideo(videoPath, isoneWord) {
    try {
        const transcriptionRequest = {
            file: fs.createReadStream(videoPath),
            model: "whisper-1",
            response_format: "verbose_json",
        };

        // Conditionally add the timestamp_granularities field
        if (isoneWord) {
            transcriptionRequest.timestamp_granularities = ["word"];
        }

        const transcription = await openai.audio.transcriptions.create(transcriptionRequest);
        return transcription;
    } catch (error) {
        console.error('Error transcribing video:', error);
        throw error;
    }
}

async function convertHindiToHinglish(changetext, language) {
    let prompt;
    if (language == 'Hindi') {
        prompt = `Convert the following text to hindi in pure devnagri alphabets  in SRT format.Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    }
    else if (language == 'English') {
        prompt = `Convert the following text to english in SRT format.Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    } else {
        prompt = `Convert the following Hindi text to Hinglish in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`
    }
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt },
            ],
            model: "gpt-4o-mini-2024-07-18",
        });

        const hinglishText = completion.choices[0].message.content;
        return hinglishText;
    } catch (error) {
        console.error("Error translating text:", error);
    }
}


const convertColorToAss = (color) => {
    if (!color) return '&H00FFFFFF'; // Default to white if color is undefined

    if (typeof color === 'string') {
        if (color.startsWith('#')) {
            const rgb = color.replace('#', '').match(/.{2}/g);
            if (rgb && rgb.length === 3) {
                return `&H00${rgb[2]}${rgb[1]}${rgb[0]}`;
            }
        } else if (color.startsWith('rgba')) {
            const matches = color.match(/\d+(\.\d+)?/g);
            if (matches && matches.length === 4) {
                const [r, g, b, a] = matches.map(Number);
                const alpha = Math.round(a * 255);
                return `&H${alpha.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`;
            }
        }
    }

    console.warn(`Invalid color format: ${color}. Defaulting to white.`);
    return '&H00FFFFFF'; // Default to white if color format is not recognized
};


// Parse complex text shadow
const parseTextShadow = (textShadow) => {
    if (!textShadow) return { maxBlur: 0, maxOffset: 0, shadowColor: '' };

    const shadows = textShadow.split(/,(?![^(]*\))/g).map(shadow => shadow.trim());
    let maxBlur = 0;
    let maxOffset = 0;
    let shadowColor = '';

    shadows.forEach(shadow => {
        const rgbaMatch = shadow.match(/rgba?\([^)]+\)/);
        let parts;
        let color = '';

        if (rgbaMatch) {
            color = rgbaMatch[0];
            parts = shadow.replace(color, '').trim().split(/\s+/);
        } else {
            parts = shadow.split(/\s+/);
        }

        if (parts.length >= 3) {
            const [offsetX, offsetY, blur] = parts;
            if (!color && parts.length > 3) {
                color = parts.slice(3).join(' ');
            }

            console.log(color, "Shadow colour");
            const blurValue = parseFloat(blur);
            maxBlur = Math.max(maxBlur, isNaN(blurValue) ? 0 : blurValue);
            maxOffset = Math.max(maxOffset, Math.abs(parseFloat(offsetX) || 0), Math.abs(parseFloat(offsetY) || 0));
            if (!shadowColor && color) {
                shadowColor = color;
            }
        }
    });

    return { maxBlur, maxOffset, shadowColor };
};

const convertSrtToAssWordByWord = (srtContent, font, color, yPosition, wordLimit = 1) => {
    const assColor = convertColorToAss(color);
    const fontSize = parseInt(font.fontSize) || 24;
    const fontWeight = (font.fontWeight === 'bold' || parseInt(font.fontWeight) >= 700) ? -1 : 0;
    const fontItalic = font.fontStyle === 'italic' ? 1 : 0;

    // Handle text shadow
    const { maxBlur, maxOffset, shadowColor } = parseTextShadow(font.textShadow);
    const outline = Math.ceil(maxBlur / 10);
    const shadow = Math.ceil(maxOffset / 2);
    const assShadowColor = convertColorToAss(shadowColor);

    // Handle text stroke
    const strokeWidth = parseInt(font.webkitTextStrokeWidth) || 0;
    const strokeColor = convertColorToAss(font.webkitTextStrokeColor);

    // Approximate padding as MarginV (vertical margin)
    const padding = font.padding ? parseInt(font.padding.split(' ')[0]) : 0;
    const marginV = yPosition || 10; // Default margin if no padding specified

    const assHeader = `[Script Info]
Title: Custom Subtitles
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font.fontFamily || 'Arial'},${fontSize},${assColor},&H00000000,&H00000000,${assShadowColor},${fontWeight},${fontItalic},0,0,100,100,${parseFloat(font.letterSpacing) || 0},0.00,1,${outline + strokeWidth},${shadow},2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const srtToAssTime = (time) => {
        return time.replace(",", ".");
    };

    const timeToSeconds = (time) => {
        const [hours, minutes, seconds] = time.split(':');
        const [secs, millis] = seconds.split('.');
        return parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(secs) + parseFloat(millis) / 1000;
    };

    const adjustTime = (startTime, endTime, index, totalChunks) => {
        const startSeconds = timeToSeconds(startTime);
        const endSeconds = timeToSeconds(endTime);
        const duration = endSeconds - startSeconds;
        const chunkDuration = duration / totalChunks;
        const wordStartTime = startSeconds + (index * chunkDuration);
        const wordEndTime = Math.min(wordStartTime + chunkDuration, endSeconds);
        return [
            timestampToAssFormat(wordStartTime),
            timestampToAssFormat(wordEndTime)
        ];
    };

    const timestampToAssFormat = (seconds) => {
        const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toFixed(2).padStart(5, '0');
        return `${hours}:${minutes}:${secs}`;
    };


    const assEvents = srtContent.split(/\n\n/).map((subtitle) => {
        const lines = subtitle.split('\n');
        if (lines.length < 3) return '';
        const [index, time, ...textLines] = lines;
        const [startTime, endTime] = time.split(' --> ').map(srtToAssTime);
        const words = textLines.join(' ').split(/\s+/);
        const totalWords = words.length;


        const groupedEvents = [];
        if (wordLimit > 1) {

            for (let i = 0; i < totalWords; i += wordLimit) {
                const chunk = words.slice(i, Math.min(i + wordLimit, totalWords)).join(' ');
                const chunkIndex = Math.floor(i / wordLimit);
                const totalChunks = Math.ceil(totalWords / wordLimit);
                const [chunkStartTime, chunkEndTime] = adjustTime(startTime, endTime, chunkIndex, totalChunks);
                groupedEvents.push(`Dialogue: 0,${chunkStartTime},${chunkEndTime},Default,,0,0,0,,{\\blur${maxBlur / 2}}${chunk}`);
            }
        } else {

            words.forEach((word, i) => {
                const [wordStartTime, wordEndTime] = adjustTime(startTime, endTime, i, totalWords);
                groupedEvents.push(`Dialogue: 0,${wordStartTime},${wordEndTime},Default,,0,0,0,,{\\blur${maxBlur / 2}}${word}`);
            });
        }

        return groupedEvents.join('\n');
    }).join('\n');

    return assHeader + assEvents;
};



function processTranscriptionToSRT(segments, wordLimit) {
    let srt = '';
    let index = 1;

    segments.forEach((segment) => {
        const words = segment.text.split(' ');
        const totalWords = words.length;
        const segmentDuration = segment.end - segment.start;

        for (let i = 0; i < totalWords; i += wordLimit) {
            const chunk = words.slice(i, i + wordLimit).join(' ');


            const wordStartTime = segment.start + (i / totalWords) * segmentDuration;
            const wordEndTime = segment.start + ((i + wordLimit) / totalWords) * segmentDuration;


            const startTime = secondsToSRTTime(wordStartTime);
            const endTime = secondsToSRTTime(Math.min(wordEndTime, segment.end));


            srt += `${index}\n${startTime} --> ${endTime}\n${chunk}\n\n`;
            index++;
        }
    });

    return srt;
}

function secondsToSRTTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12); // Get "HH:MM:SS.mmm"
    return time.replace('.', ','); // Replace dot with comma for SRT format
}


const adjustTime = (startTime, duration, index, totalWords) => {
    const startTimeSeconds = timeToSeconds(startTime);
    const wordDuration = duration / totalWords;
    const newStartTime = startTimeSeconds + (wordDuration * index);
    const newEndTime = newStartTime + wordDuration;
    return [secondsToTime(newStartTime), secondsToTime(newEndTime)];
};

// Convert SRT time format to seconds
const timeToSeconds = (time) => {
    const [hours, minutes, seconds] = time.split(':').map(parseFloat);
    return hours * 3600 + minutes * 60 + seconds;
};

// Convert seconds back to ASS time format
const secondsToTime = (seconds) => {
    const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${hours}:${minutes}:${secs}`;
};

function generateSRTSimple(words) {
    let srt = '';
    words.forEach((el, index) => {
        const startTime = timestampToSRTFormat(el.start);
        const endTime = timestampToSRTFormat(el.end);

        srt += `${index + 1}\n`;
        srt += `${startTime} --> ${endTime}\n`;
        srt += `${el.word}\n\n`;
    });
    return srt;
}



function timestampToSRTFormat(timestamp) {
    const date = new Date(timestamp * 1000);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5);
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

async function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration / 60; // in minutes
                resolve(duration);
            }
        });
    });
}


const scheduleFileDeletion = (containerName, blobName, delayInMinutes) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + delayInMinutes);

    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
        try {
            await deleteFromAzure(containerName, blobName);
            console.log(`File ${blobName} deleted from container ${containerName}`);
        } catch (error) {
            console.error(`Error deleting file ${blobName} from container ${containerName}:`, error);
        }
    });
};

const scheduleDocumentDeletion = (collectionPath, docId, delayInMinutes) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + delayInMinutes);

    // Schedule cron job based on future date
    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
        try {
            // Reference to the specific document
            const docRef = admin.firestore().doc(`${collectionPath}/${docId}`);

            // Delete the document
            await docRef.delete();
            console.log(`Document with ID: ${docId} deleted from ${collectionPath}`);
        } catch (error) {
            console.error(`Error deleting document with ID: ${docId} from ${collectionPath}:`, error);
        }
    });

    console.log(`Scheduled document deletion for ${docId} at ${date}`);
};


function generateOrderId() {
    const uniqueId = crypto.randomBytes(16).toString("hex");

    const hash = crypto.createHash("sha256");
    hash.update(uniqueId);

    const orderId = hash.digest("hex");
    7;

    return orderId.substr(0, 12);
}

app.listen(3000, () => console.log('Server running on port 3000'));




// const express = require("express");
// const cors = require("cors");
// const crypto = require("crypto");
// const { Cashfree } = require("cashfree-pg");

// require("dotenv").config();

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(
//   express.urlencoded({
//     extended: true,
//   })
// );



// app.listen(8000, () => {
//   console.log("Server is running on port 8000");
// });
