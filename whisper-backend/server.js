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
const streamifier = require('streamifier');
const dotenv = require('dotenv');
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


const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});


const upload = multer({ storage: storage });



async function uploadToS3(filePath, bucketName) {
    const fileContent = fs.readFileSync(filePath);
    const params = {
        Bucket: bucketName,
        Key: path.basename(filePath),
        Body: fileContent,
    };

    return s3.upload(params).promise();
}



async function deleteFromS3(filePath, bucketName) {
    const params = {
        Bucket: bucketName,
        Key: path.basename(filePath),
    };

    return s3.deleteObject(params).promise();
}

async function deleteFileFromS3(bucketName, key) {
    const params = {
        Bucket: bucketName,
        Key: key,
    };

    try {
        await s3.deleteObject(params).promise();
        console.log(`File ${key} deleted from bucket ${bucketName}`);
    } catch (error) {
        console.error(`Error deleting file ${key} from bucket ${bucketName}:`, error);
        throw error; // Rethrow the error after logging it
    }
}


app.post('/api/process-video', upload.single('video'), async (req, res) => {
    try {
        console.log(req)
        const videoPath = req.file.path;
        const language = req.body.SelectedLang;
        const uid = req.body.uid;
        const userdata = JSON.parse(req.body.userdata)
        console.log(userdata.usertype, uid);
        console.log(language, "from front");
        let remaningmins = 0;
        const outputPath = `${videoPath}_output.mp4`;
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');

        const transcription = await transcribeVideo(videoPath);


        const srtContent = generateSRT(transcription.words);
        console.log(srtContent)
        let outputSrt;

        if ((transcription.language == "english" && language == "English") || (transcription.language == "hindi" && language == "Hindi")) {
            outputSrt = srtContent;
        } else {
            outputSrt = await convertHindiToHinglish(srtContent, language);
        }



        const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename.replace('.mp4', '')}.srt`);
        fs.writeFileSync(srtFilePath, outputSrt);

        const videoDuration = await getVideoDuration(videoPath);
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
        }



        // Upload video and SRT to S3

        const videoUpload = await uploadToS3(videoPath, 'capsuservideos');
        const srtUpload = await uploadToS3(srtFilePath, 'capsuservideos');
        console.log(videoUpload, srtUpload)


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

        fs.unlinkSync(videoPath);
        fs.unlinkSync(srtFilePath);


        res.json({
            transcription: formatSubtitle(outputSrt),
            rawData: transcription.words,
            inputFile: videoUpload.Location,
            lang: transcription.language,
            key: videoUpload.Key,
            srt: srtUpload.Location,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/change-style', upload.single('video'), async (req, res) => {
    try {
        const { inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize, userdata, uid, save, key } = req.body;
        console.log(font);

        if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize || !userdata || !uid) {
            return res.status(400).json({ error: 'Missing required fields in the request body' });
        }
        const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');
        const videoPath = inputVideo;
        const srtFilePath = path.join(__dirname, 'uploads', `${path.basename(srtUrl)}`);
        const srtResponse = await axios.get(srtUrl);
        fs.writeFileSync(srtFilePath, srtResponse.data);
        const srtContent = fs.readFileSync(srtFilePath, 'utf-8');
        const assContent = convertSrtToAssWordByWord(srtContent, font, color, yPosition);
        const assFilePath = path.join(__dirname, 'uploads', 'subtitles.ass');
        fs.writeFileSync(assFilePath, assContent);
        const tempOutputPath = temp.path({ suffix: '.mp4' });

        let remaningmins = 0;

        // Check video length and user type
        let ffmpegCommand;

        const outputFilePath = videoPath.replace('.mp4', `_output.mp4`);
        await new Promise((resolve, reject) => {
            if (userdata.usertype === 'free') {
                ffmpegCommand = `ffmpeg -i ${videoPath} -i ${watermarkPath} -filter_complex "[1:v] scale=203.2:94.832 [watermark]; [0:v][watermark] overlay=158:301, ass=${assFilePath}" -c:a copy ${tempOutputPath}`;
            } else {
                ffmpegCommand = `ffmpeg -i ${videoPath} -vf "ass=${assFilePath}" -c:a copy ${tempOutputPath}`
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
            outputUpload = await uploadToS3(tempOutputPath, 'capsuservideos');
            outputVideoUrl = outputUpload.Location;
            // Schedule deletion based on user type
            if (userdata.usertype === 'free') {
                scheduleFileDeletion('capsuservideos', key, 5)
                scheduleFileDeletion('capsuservideos', outputUpload.Key, 2); // 24 hours
            } else {
                scheduleFileDeletion('capsuservideos', key, 8);
                scheduleFileDeletion('capsuservideos', outputUpload.Key, 2); // 1 month
            }

            // Delete the input video
            // await deleteFromS3(videoPath, 'capsuservideos');

            const videos = userdata.videos || [];


            await db.collection('users').doc(uid).collection('videos').add({
                videoUrl: videoPath,
                srt: srtUrl,
                fontadded: font,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            outputUpload = await uploadToS3(tempOutputPath, 'capsuservideos');
            outputVideoUrl = outputUpload.Location;

            scheduleFileDeletion('capsuservideos', outputUpload.Key, 1)

            await deleteFromS3(videoPath, 'capsuservideos');
        }


        fs.unlinkSync(srtFilePath)
        fs.unlinkSync(assFilePath)

        res.json({ videoUrl: outputVideoUrl });
    } catch (error) {
        console.error('Error changing style:', error);
        res.status(500).json({ error: error.message });
    }
});


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

async function transcribeVideo(videoPath) {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(videoPath),
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });
        // const words = transcription;
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

// Convert SRT to ASS with word-by-word display
const convertSrtToAssWordByWord = (srtContent, font, color, yPosition) => {
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

    // ... (keep the existing srtToAssTime function) 

    const srtToAssTime = (time) => {
        return time.replace(",", ".");
    };

    // Parse SRT and create ASS dialogue lines, word by word
    const assEvents = srtContent.split(/\n\n/).map((subtitle) => {
        const lines = subtitle.split('\n');
        if (lines.length < 3) return '';
        const [index, time, ...textLines] = lines;
        const [startTime, endTime] = time.split(' --> ').map(srtToAssTime);
        const duration = timeToSeconds(endTime) - timeToSeconds(startTime);
        const words = textLines.join(' ').split(' ');
        const totalWords = words.length;

        return words.map((word, i) => {
            const [wordStartTime, wordEndTime] = adjustTime(startTime, duration, i, totalWords);
            return `Dialogue: 0,${wordStartTime},${wordEndTime},Default,,0,0,0,,{\\blur${maxBlur / 2}}${word}`;
        }).join('\n');
    }).join('\n');

    return assHeader + assEvents;
};



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

function generateSRT(words) {
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


const scheduleFileDeletion = (bucketName, key, delayInMinutes) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + delayInMinutes);

    const cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
        try {
            await deleteFileFromS3(bucketName, key);
            console.log(`File ${key} deleted from ${bucketName}`);
        } catch (error) {
            console.error(`Error deleting file ${key} from ${bucketName}:`, error);
        }
    });
};

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

// Cashfree.XClientId = process.env.CLIENT_ID;
// Cashfree.XClientSecret = process.env.CLIENT_SECRET;
// Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

// function generateOrderId() {
//   const uniqueId = crypto.randomBytes(16).toString("hex");

//   const hash = crypto.createHash("sha256");
//   hash.update(uniqueId);

//   const orderId = hash.digest("hex");
//   7;

//   return orderId.substr(0, 12);
// }

// app.get("/", (req, res) => {
//   res.send("Hello World!");
// });
// app.get("/payment", async (req, res) => {
//   try {
//     const orderAmount = req.query.order_amount || 0;
//     let request = {
//       order_amount: orderAmount,
//       order_currency: "INR",
//       order_id: await generateOrderId(),
//       customer_details: {
//         customer_id: "webcodder01",
//         customer_phone: "9999999999",
//         customer_name: "Web Codder",
//         customer_email: "webcodder@example.com",
//       },
//     };

//     Cashfree.PGCreateOrder("2023-08-01", request)
//       .then((response) => {
//         console.log(response.data);
//         res.json(response.data);
//       })
//       .catch((error) => {
//         console.error(error.response.data.message);
//       });
//   } catch (error) {
//     console.log(error);
//   }
// });

// app.post("/verify", async (req, res) => {
//   try {
//     let { orderId } = req.body;

//     Cashfree.PGOrderFetchPayments("2023-08-01", orderId)
//       .then((response) => {
//         res.json(response.data);
//       })
//       .catch((error) => {
//         console.error(error.response.data.message);
//       });
//   } catch (error) {
//     console.log(error);
//   }
// });

// app.listen(8000, () => {
//   console.log("Server is running on port 8000");
// });
