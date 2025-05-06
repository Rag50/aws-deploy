const express = require('express')
const multer = require('multer')
const fs = require('fs')
const { exec, execSync } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const { transliterate } = require('transliteration');
const Sanscript = require("@indic-transliteration/sanscript")
const slug = require('slug');
const OpenAI = require('openai');
const { getFirestore, doc, setDoc, getDoc, updateDoc } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const { getAuth } = require("firebase-admin/auth");
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


const AZURE_OPENAI_API_KEY = '';
const AZURE_OPENAI_API_KEY_INTERNATIONAL = ''

app.post('/api/process-video', upload.single('video'), async (req, res) => {
    try {
        const videoFilePath = req.file.path;
        const language = req.body.SelectedLang;
        const isoneWord = req.body.WordLimit === 'true';
        const wordLayout = req.body.WordLayout;
        console.log(isoneWord, "from front");
        let remaningmins = 0;
        const outputPath = `${videoFilePath}_random.mp4`;
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');

        const transcription = await processVideoInput(videoFilePath, isoneWord);
        console.log(transcription.segments, "process wali")

        let srtContent


        console.log("Ran");
        if (isoneWord) {
            srtContent = generateSRTFromWords(transcription.words);
        } else {
            srtContent = generateSRTNormal(transcription.segments, 4);
        }



        // console.log(srtContent);
        let outputSrt;


        const directLanguages = ["English", "Hindi"];
        const supportedLanguages = ["Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Punjabi"];


        if (directLanguages.includes(language) && transcription.language.toLowerCase() === language.toLowerCase()) {
            outputSrt = srtContent;
        } else if (supportedLanguages.includes(language)) {
            outputSrt = srtContent;
        } else {
            console.log('Called');
            outputSrt = await callGPT4(language, srtContent);
        }



        const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename.replace('.mp4', '')}.srt`);
        fs.writeFileSync(srtFilePath, outputSrt);


        const random = processShuffledText(wordLayout, videoFilePath, srtFilePath, outputPath, isoneWord);
        console.log(random, "Scripttttt")

        // Upload video and SRT to azure

        let videoUpload;
        if (wordLayout == 'Shuffled text') {
            videoUpload = await uploadToAzure(outputPath);
        } else {
            videoUpload = await uploadToAzure(videoFilePath);
        }
        const srtUpload = await uploadToAzure(srtFilePath);
        console.log(videoUpload, srtUpload)


        // fs.unlinkSync(videoFilePath);
        fs.unlinkSync(srtFilePath);
        if (wordLayout == 'Shuffled text') {
            fs.unlinkSync(outputPath);
        }


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

// magic link and other feature pushout and new animations and user data script 

app.post('/api/change-style', upload.single('video'), async (req, res) => {
    try {
        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, keyS3, transcriptions, isOneword, videoResolution, soundEffects } = req.body;
        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.png');
        const tempassFile = path.join(__dirname, 'watermarks', 'temp.ass');
        const videoPath = inputVideo;
        const srtFilePath = path.join(__dirname, 'uploads', `${path.basename(srtUrl)}`);
        const srtResponse = await axios.get(srtUrl);
        fs.writeFileSync(srtFilePath, srtResponse.data);
        const srtContent = generateSRT(transcriptions);
        let assContent = isOneword ? convertSrtToAssWordByWord(srtContent, font, color, yPosition) : convertSrtToAssWordByWord(srtContent, font, color, yPosition, 4);
        const assFilePath = path.join(__dirname, 'uploads', 'subtitles.ass');
        fs.writeFileSync(assFilePath, assContent);
        const tempOutputPath = temp.path({ suffix: '.mp4' });
        let resheight;
        let resWidth;

        if (videoResolution == '16:9') {
            resheight = 1080;
            resWidth = 1920;
        } else if (videoResolution == '1:1') {
            resheight = 1080;
            resWidth = 1080;
        } else {
            resWidth = 720;
            resheight = 1280;
        }


        let remaningmins = 0;

        let modifedInput = await VideoEmojiprocessing(assFilePath, videoPath, watermarkPath, resWidth, resheight);
        const inputs = [modifedInput];


        let soundEffectTimestamp = 5000;
        const videoStreamIndex = 0;
        const watermarkStreamIndex = 1;
        const soundEffectStartIndex = watermarkPath ? 2 : 1;



        if (watermarkPath) inputs.push(watermarkPath);

        // Handle sound effect inputs and filters only if there are sound effects
        const soundEffectInputs = soundEffects.length > 0 ? soundEffects.map(effect => `-i ${effect.file}`).join(' ') : '';
        const soundEffectFilters = soundEffects.length > 0
            ? soundEffects.map((effect, index) =>
                `[${soundEffectStartIndex + index}:a]adelay=${effect.timestamp}|${effect.timestamp}[sfx${index}]`
            ).join('; ') : '';  // If no sound effects, this will be empty

        const audioMixFilters = soundEffects.length > 0
            ? `[${videoStreamIndex}:a]${soundEffects.map((_, index) => `[sfx${index}]`).join('')}amix=inputs=${soundEffects.length + 1}:duration=first[audioMix]`
            : `[0:a][0:a]amix=inputs=2[audioMix]`;  // If no sound effects, just mix the original audio stream

        let ffmpegCommand;
        const outputFilePath = path.join(__dirname, 'uploads', path.basename(videoPath).replace('.mp4', '_output.mp4'));


        // 10 min watermark free video and then 10 mins with watemark
        await new Promise((resolve, reject) => {
            if (userdata.usertype === 'free') {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=16/9[scaled]; ` +
                        `[scaled]subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=1/1[scaled]; ` +
                        `[scaled]subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters};` : ''} ` +
                        `${audioMixFilters ? `${audioMixFilters};` : ''} ` +
                        `[${videoStreamIndex}:v]subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                }
            } else {
                if (videoResolution === '16:9') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=16/9,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else if (videoResolution === '1:1') {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]scale=${resWidth}:${resheight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resheight}:(ow-iw)/2:(oh-ih)/2,setdar=1/1,subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
                } else {
                    ffmpegCommand = `ffmpeg ${inputs.map(input => `-i "${input}"`).join(' ')} ${soundEffectInputs} -filter_complex "` +
                        `${soundEffectFilters ? `${soundEffectFilters}; ` : ''}` +
                        `${audioMixFilters ? `${audioMixFilters}; ` : ''}` +
                        `[${videoStreamIndex}:v]subtitles="${tempassFile}":force_style='Alignment=2'[outv]" ` +
                        `-map "[outv]" -map "[audioMix]" -c:v libx264 -c:a aac "${outputFilePath}"`;
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

        // 10 mins watermark and 10 mins no watermark change 
        // save  logic update 
        // magic link 
        // machine side error 
        if (save) {

            // Upload output video to S3
            // outputUpload = await uploadToS3(outputFilePath, 'capsuservideos');
            // outputVideoUrl = outputUpload.Location;
            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;
            // Schedule deletion based on user type
            if (userdata.usertype === 'free') {
                scheduleFileDeletion('capsuservideos', keyS3, 15)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 15);
            } else {
                scheduleFileDeletion('capsuservideos', keyS3, 20)
                scheduleFileDeletion('capsuservideos', outputUpload.blobName, 20);
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
                scheduleDocumentDeletion(docPath, docId, 15)
            } else {
                scheduleDocumentDeletion(docPath, docId, 20)
            }

        } else {

            outputUpload = await uploadToAzure(outputFilePath);
            outputVideoUrl = outputUpload.url;

            scheduleFileDeletion('capsuservideos', outputUpload.blobName, 5);

            scheduleFileDeletion('capsuservideos', keyS3, 5)


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
        fs.unlinkSync(modifedInput)

        res.json({ videoUrl: outputVideoUrl });
    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }
});


// one word ai emoji sync addition 
app.post('/api/aiemoji-sync', async (req, res) => {
    try {
        const { transcriptions } = req.body;
        let transcription = await addEmojisToTranscription(transcriptions);

        res.json({ transcriptions: transcription });

    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }

})

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


async function addEmojisToTranscription(transcriptionArray) {
    try {
        const prompt = `For each single word below, suggest ONE MOST RELEVANT EMOJI. 
Return ONLY EMOJIS in order, one per line, no numbers or explanations.
Words:
${transcriptionArray.map(t => t.value).join('\n')}`;

        const response = await fetch(
            'https://cheta-m9rbttyh-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-4.1-nano/chat/completions?api-version=2025-01-01-preview',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_OPENAI_API_KEY_INTERNATIONAL
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3
                })
            }
        );

        const data = await response.json();
        const emojiResponse = data?.choices?.[0]?.message?.content || '';

        const emojis = emojiResponse
            .split('\n')
            .map(line => {
                const match = line.match(/[\p{Emoji}]/gu);
                return match ? match[0] : null;
            })
            .filter(Boolean);

        // Ensure the emoji list is the same length
        const fallbackEmojis = ['✨', '🌟', '🔥', '💡', '📌', '✅', '🎯', '📍', '🌈', '💫', '🔸', '🔹'];
        while (emojis.length < transcriptionArray.length) {
            emojis.push(fallbackEmojis[Math.floor(Math.random() * fallbackEmojis.length)]);
        }

        return transcriptionArray.map((transcription, index) => ({
            ...transcription,
            value: `${transcription.value} ${emojis[index]}`
        }));
    } catch (error) {
        console.error('Error processing transcriptions:', error);
        return transcriptionArray.map(t => ({ ...t, value: `${t.value} ⚠️` }));
    }
}

// changes to be made here with new mail 
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
</head>
<body>
  <a href="https://capsai.co/" target="_blank">
    <img src="https://capsaistore.blob.core.windows.net/capsaiassets/Welcome%20image%20(3).png" alt="Welcome Image">
  </a>
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



app.post("/api/sendVerificationCode-email-auth", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    const verificationCode = Math.floor(1000 + Math.random() * 9000);

    try {
        // Save the code to Firestore
        await db.collection("verificationCodes").doc(email).set({
            code: verificationCode,
            expiresAt: Date.now() + 1 * 60 * 1000,
        });


        const mailOptions = {
            from: '"Capsai" <ai.editor@capsai.co>',
            to: email,
            subject: "Your Verification Code",
            html: `
            <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CapsAI OTP Verification</title>
    <style>
        @import url('https://fonts.cdnfonts.com/css/gilroy-bold');
        
        body {
            font-family: 'Gilroy', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f9f9f9;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 32px;
            border-radius: 12px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 420px;
            width: 100%;
        }
        h2 {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 12px;
        }
        p {
            font-size: 15px;
            color: #666;
            margin-bottom: 20px;
        }
        .otp-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f4f4f4;
            padding: 16px;
            border-radius: 12px;
            margin-top: 15px;
        }
        .otp {
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 6px;
            flex-grow: 1;
            text-align: center;
        }
        .copy-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            padding: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Verify your email to sign up for <strong>CapsAI</strong></h2>
        <p>To complete the sign-in process, enter this 4-digit code in the original window:</p>
        <div class="otp-box">
            <span class="otp" id="otp-code">${verificationCode}</span>
            <button class="copy-btn" id="copy-btn">📋</button>
        </div>
    </div>

    <script>
        document.addEventListener("DOMContentLoaded", function () {
            document.getElementById("copy-btn").addEventListener("click", function () {
                const otpText = document.getElementById('otp-code').textContent.trim();
                const textArea = document.createElement("textarea");
                textArea.value = otpText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
                alert('OTP copied to clipboard! ✅');
            });
        });
    </script>
</body>
</html>

          `,
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

        res.status(200).json({ message: "Verification code sent" });
    } catch (error) {
        console.error("Error sending verification code:", error);
        res.status(500).json({ message: "Failed to send email", error: error.message });
    }
});

app.post('/api/magic-demo-gcp', upload.single('video'), async (req, res) => {

});


app.post("/api/verifyCode-email-auth", async (req, res) => {
    const { email, code, uid } = req.body;
    console.log(email, code, uid);

    if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required." });
    }

    const doc = await db.collection("verificationCodes").doc(email).get();
    if (!doc.exists || doc.data().code !== code || Date.now() > doc.data().expiresAt) {
        return res.status(400).json({ message: "Invalid or expired code." });
    }


    await db.collection("verificationCodes").doc(email).delete();


    const auth = getAuth();
    const customToken = await auth.createCustomToken(email);

    res.status(200).json({ token: customToken });
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

function extractAudioFromVideo(videoFilePath, audioFilePath) {
    return new Promise((resolve, reject) => {

        const command = `ffmpeg -i "${videoFilePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioFilePath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error extracting audio:', stderr);
                reject(error);
            } else {
                console.log('Audio extracted successfully:', audioFilePath);
                resolve(audioFilePath);
            }
        });
    });
}

async function callWhisper(audioFilePath, isoneWord) {
    console.log(audioFilePath);
    const url = `https://capsaiendpoint.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-02-15-preview`; // Changed to transcriptions and updated API version

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath), { filename: 'audio.wav' });
    formData.append('response_format', 'verbose_json');

    if (isoneWord) {
        formData.append('timestamp_granularities[]', 'word');
    }

    const headers = {
        ...formData.getHeaders(),
        'api-key': AZURE_OPENAI_API_KEY,
    };

    try {
        const response = await axios.post(url, formData, { headers });

        // Process word-level timestamps
        if (response.data.words) {
            response.data.words.forEach(word => {
                console.log(`Word: ${word.word} | Start: ${word.start} | End: ${word.end}`);
            });
        } else {
            console.log('No word-level timestamps in response:', response.data);
        }

        return response.data;
    } catch (error) {
        console.error('Error calling Whisper:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function processVideoInput(videoFilePath, isoneWord) {
    console.log('IN Code')
    try {

        console.log('Extracting audio from video...');
        const audioFilePath = 'uploads/extracted-audio.wav';
        await extractAudioFromVideo(videoFilePath, audioFilePath);
        // one word stucking after audio extraction 


        console.log('Sending audio to Whisper API...');
        const srtContent = await callWhisper(audioFilePath, isoneWord);
        console.log('Whisper Transcription (SRT):\n', srtContent);


        fs.unlinkSync(audioFilePath);
        console.log('Temporary audio file deleted.');

        return srtContent;
    } catch (error) {
        console.error('Error processing video input:', error);
        throw error;
    }
}

function generateSRTFromWords(words) {
    let srt = '';
    let counter = 1;

    words.forEach(word => {
        srt += `${counter}\n`;
        srt += `${formatTime(word.start)} --> ${formatTime(word.end)}\n`;
        srt += `${word.word}\n\n`;
        counter++;
    });

    return srt;
}

function generateSRTNormal(segments, wordLimit) {
    let srt = '';
    let index = 1;

    const validSegments = Array.isArray(segments) ? segments : [];

    validSegments.forEach((segment) => {
        if (
            !segment?.text ||
            typeof segment.start === 'undefined' ||
            typeof segment.end === 'undefined'
        ) {
            return;
        }

        const words = segment.text.split(' ').filter(word => word.trim() !== '');
        const totalWords = words.length;
        const segmentDuration = segment.end - segment.start;

        if (totalWords === 0 || segmentDuration <= 0) return;

        if (wordLimit === 1) {
            // Equal time distribution for each word
            const wordDuration = segmentDuration / totalWords;

            words.forEach((word, i) => {
                const startTime = segment.start + (i * wordDuration);
                const endTime = segment.start + ((i + 1) * wordDuration);

                srt += `${index}\n${secondsToSRTTime(startTime)} --> ${secondsToSRTTime(endTime)}\n${word}\n\n`;
                index++;
            });
        } else {
            // Existing logic for multi-word subtitles
            for (let i = 0; i < totalWords; i += wordLimit) {
                const chunk = words.slice(i, i + wordLimit).join(' ');
                const chunkStart = segment.start + (i / totalWords) * segmentDuration;
                const chunkEnd = segment.start + ((i + wordLimit) / totalWords) * segmentDuration;

                srt += `${index}\n${secondsToSRTTime(chunkStart)} --> ${secondsToSRTTime(chunkEnd)}\n${chunk}\n\n`;
                index++;
            }
        }
    });

    return srt;
}




function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(Math.floor(seconds));
    date.setMilliseconds((seconds % 1) * 1000);
    return date.toISOString().substring(11, 23).replace('.', ',');
}





async function callGPT4(language, changetext) {
    console.log(changetext);
    let prompt;

    if (language === 'Hindi') {
        prompt = `Convert the following text to Hindi in pure Devanagari alphabets in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`;
    } else if (language === 'English') {
        prompt = `Convert the following text to English in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`;
    } else {
        prompt = `Convert the following Hindi text to Hinglish in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}`;
    }

    const url = `https://capsaiendpoint.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-08-01-preview`;

    const data = {
        messages: [
            { role: 'user', content: prompt }
        ],
    };

    const headers = {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY,
    };

    try {
        const response = await axios.post(url, data, { headers });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling GPT-4:', error.response ? error.response.data : error.message);
        throw error;
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

const VideoEmojiprocessing = async (assFilePath, videoPath, watermarkPath, resWidth, resHeight) => {
    console.log("Emoji processing started");
    try {
        const { subtitles } = parseASS(assFilePath, emojiMapping, assFilePath);
        const outputFilePath = path.join(__dirname, 'uploads', `emojitempoutput_${Date.now()}.mp4`);

        const emojiMap = new Map();
        const overlayCommands = [];
        const emojiInputs = [];
        let overlayIndex = 0;


        for (const subtitle of subtitles) {

            const validEmojis = subtitle.emojis.filter(emoji => {
                const emojiPng = emojiMapping[emoji] ? path.join(__dirname, emojiMapping[emoji]) : null;
                return emojiPng && fs.existsSync(emojiPng);
            });

            for (const emoji of validEmojis) {
                const emojiPng = path.join(__dirname, emojiMapping[emoji]);
                if (!emojiMap.has(emojiPng)) {
                    emojiMap.set(emojiPng, emojiInputs.length + 1);
                    emojiInputs.push(`-i "${emojiPng}"`);
                }

                const startTime = timeToSeconds(subtitle.start);
                const endTime = timeToSeconds(subtitle.end);
                const emojiSize = 45;
                const emojiX = `${subtitle.x} - ${emojiSize}`;
                const emojiY = `${subtitle.y} - 400`;

                overlayCommands.push({
                    inputIndex: emojiMap.get(emojiPng),
                    command: `[${emojiMap.get(emojiPng)}:v]scale=${emojiSize}:${emojiSize}[emoji${overlayIndex}];
                      [tmp${overlayIndex}][emoji${overlayIndex}]overlay=x='${emojiX}':y='${emojiY}':enable='between(t,${startTime},${endTime})'[tmp${overlayIndex + 1}];`
                });
                overlayIndex++;
            }
        }


        let filterComplex = `[0:v]scale=${resWidth}:${resHeight}[tmp0];`;

        if (overlayCommands.length > 0) {
            overlayCommands.forEach((overlay, index) => {
                filterComplex += overlay.command.replace('[scaled]', `[tmp${index}]`);
            });
        }

        filterComplex += `[tmp${overlayCommands.length}]subtitles=${assFilePath}:force_style='FontSize=18'[final];`;

        const ffmpegCommand = `ffmpeg -i "${videoPath}" ${emojiInputs.join(' ')} -filter_complex "${filterComplex}" -map "[final]" -map 0:a -c:a copy -preset veryfast -y "${outputFilePath}"`;

        const maxExecutionTime = 300000;
        const ffmpegProcess = exec(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 });

        let lastProgress = Date.now();
        ffmpegProcess.stderr.on('data', (data) => {
            lastProgress = Date.now();
            console.log(`FFmpeg progress: ${data}`);
        });

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                ffmpegProcess.kill();
                reject(new Error('FFmpeg processing timed out'));
            }, maxExecutionTime);

            ffmpegProcess.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });

            ffmpegProcess.on('exit', (code) => {
                clearTimeout(timeoutId);
                if (code === 0) {
                    console.log('FFmpeg processing completed successfully');
                    resolve(outputFilePath);
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });
        });
    } catch (error) {
        console.error('Error in VideoEmojiprocessing:', error);
        throw error;
    }
};


function processShuffledText(wordLayout, videoPath, srtFilePath, outputPath, isoneWord) {
    if (wordLayout === "Shuffled text") {
        console.log("IN SHUFFLE");
        let command;
        if (isoneWord) {
            command = `/home/saksham/virtual/venv/bin/python3 /home/saksham/virtual/script2.py ${`/home/saksham/Caps/aws-deploy/whisper-backend/${videoPath}`} ${srtFilePath} ${`/home/saksham/Caps/aws-deploy/whisper-backend/${outputPath}`}`;
        } else {
            command = `/home/saksham/virtual/venv/bin/python3 /home/saksham/virtual/script3.py ${`/home/saksham/Caps/aws-deploy/whisper-backend/${videoPath}`} ${srtFilePath} ${`/home/saksham/Caps/aws-deploy/whisper-backend/${outputPath}`}`;
        }
        execSync(command)

        return 1;
    }
}


function generateOrderId() {
    const uniqueId = crypto.randomBytes(16).toString("hex");

    const hash = crypto.createHash("sha256");
    hash.update(uniqueId);

    const orderId = hash.digest("hex");
    7;

    return orderId.substr(0, 12);
}

function parseStyles(lines) {
    const styleSection = lines.findIndex((line) => line.trim() === '[V4+ Styles]');
    if (styleSection === -1) return null;

    const formatLine = lines[styleSection + 1];
    const styleLine = lines[styleSection + 2];

    if (!formatLine || !styleLine) return null;

    const formatFields = formatLine.split(':')[1].split(',').map(f => f.trim());
    const styleFields = styleLine.split(':')[1].split(',').map(f => f.trim());

    const style = {};
    formatFields.forEach((field, index) => {
        style[field] = styleFields[index];
    });

    return style;
}


function parseASS(file, emojiMapping, outputPath) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const subtitles = [];
    const modifiedLines = [...lines];

    // Parse style information
    const style = parseStyles(lines); // Ensure `parseStyles` is defined
    const videoHeight = 1280; // Assuming 720p video
    const videoWidth = 780;

    const marginV = parseFloat(style?.MarginV || 101.25);
    const alignment = parseInt(style?.Alignment || 2);

    const defaultY = videoHeight - marginV;

    // Find the `[Events]` section
    const eventsStart = lines.findIndex((line) => line.trim() === '[Events]');
    if (eventsStart === -1) return { subtitles, modifiedLines };

    const formatLine = lines[eventsStart + 1];
    const formatFields = formatLine.split(':')[1].split(',').map((field) => field.trim());
    const textIndex = formatFields.indexOf('Text');
    if (textIndex === -1) return { subtitles, modifiedLines };

    const events = lines.slice(eventsStart + 2).filter((line) => line.startsWith('Dialogue:'));

    events.forEach((line, lineIndex) => {
        const parts = line.split(',');
        const start = parts[1].trim();
        const end = parts[2].trim();
        const text = parts.slice(textIndex).join(',').trim();

        const emojis = [...text].filter((char) => emojiMapping[char]);

        if (emojis.length > 0) {
            const emojiRegex =
                /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{1F000}-\u{1F02B}]/gu;
            const textWithoutEmoji = text.replace(emojiRegex, '').trim();

            const x = videoWidth / 2;
            const y = defaultY;

            subtitles.push({
                start,
                end,
                text: textWithoutEmoji,
                emojis,
                x,
                y,
            });

            // Modify the line in the ASS file
            const modifiedLine = parts.slice(0, textIndex).join(',') + ',' + textWithoutEmoji;
            modifiedLines[eventsStart + 2 + lineIndex] = modifiedLine;
        }
    });

    // Write the modified ASS file to the output path
    fs.writeFileSync(outputPath, modifiedLines.join('\n'), 'utf-8');

    return { subtitles, modifiedLines };
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
