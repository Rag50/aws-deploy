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
const app = express()
var slug = require('slug');
// const upload = multer({ dest: 'uploads/' })
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: "key",
});

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.post('/api/process-video', upload.single('video'), async (req, res) => {
  try {
    const videoPath = req.file.path
    console.log(videoPath);
    const outputPath = `${videoPath}_output.mp4`
    const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');


    const transcription = await transcribeVideo(videoPath)
    console.log(transcription);
    const srtContent = generateSRT(transcription.words);
    let outputSrt

    if (transcription.language == "english") {
      outputSrt = srtContent
    } else {
      outputSrt = await convertHindiToHinglish(srtContent, transcription.language);
    }

    console.log(outputSrt, "main one")

    const formatedcaptions = formatSubtitle(outputSrt);

    console.log(formatedcaptions, 'formated');


    const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename.replace('.mp4', '')}.srt`);
    fs.writeFileSync(srtFilePath, outputSrt);


    res.json({ transcription: formatedcaptions, rawData: transcription.words, inputFile: videoPath, lang: transcription.language, srt: srtFilePath });




  }
  catch (error) {
    res.status(500).json({ error: error.message })
  }
})


app.post('/api/change-style', upload.single('video'), async (req, res) => {
  console.log('change hit');

  try {
    const { inputVideo, font, color, xPosition, yPosition, srtUrl ,  Fontsize} = req.body;
    console.log(inputVideo, font, color, xPosition, yPosition, srtUrl, Fontsize);
    const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');


    if (!inputVideo || !font || !color || !xPosition || !yPosition || !srtUrl || !Fontsize) {
      return res.status(400).json({ error: 'Missing required fields in the request body' });
    }
    const videoPath = path.join(__dirname, inputVideo);
  
    const srtFilePath = path.join(__dirname, srtUrl);



    const outputFilePath = videoPath.replace('.mp4', `l.mp4_output.mp4`);
    await new Promise((resolve, reject) => {
      const ffmpegCommand = `ffmpeg -i ${videoPath} -i ${watermarkPath} -filter_complex "[1:v] scale=203.2:94.832 [watermark]; [0:v][watermark] overlay=10:10, subtitles=${srtFilePath}:force_style='Fontname=${font},Fontsize=${Fontsize},PrimaryColour=&H${color.slice(5, 7)}${color.slice(3, 5)}${color.slice(1, 3)}&,Alignment=2,MarginV=${yPosition}'" -c:a copy ${outputFilePath}
`;
      exec(ffmpegCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });

    res.json({ videoUrl: `http://localhost:3000/uploads/${path.basename(outputFilePath)}` });
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

    // Split words by considering non-ASCII characters and punctuation
    const words = valueLine.match(/[\w'-]+|[^\w\s]/g);

    // Calculate the duration of the entire entry
    const totalDuration = parseTimecode(timeEnd) - parseTimecode(timeStart);
    const wordDuration = totalDuration / words.length;

    words.forEach((word, index) => {
      const wordTimeStart = parseTimecode(timeStart) + (index * wordDuration);
      const wordTimeEnd = wordTimeStart + wordDuration;

      const formattedEntry = {
        id: `${idValue}-${index + 1}`, // Unique ID for each word
        timeStart: formatTimecode(wordTimeStart),
        timeEnd: formatTimecode(wordTimeEnd),
        value: word
      };
      result.push(formattedEntry);
    });
  });

  return result;
}

// Helper function to parse timecode to milliseconds
function parseTimecode(timecode) {
  const [hours, minutes, seconds] = timecode.split(':');
  const [secs, millis] = seconds.split(',');
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs)) * 1000 + parseInt(millis);
}

// Helper function to format milliseconds to timecode
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
  console.log('trans');
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Convert the following Hindi text to Hinglish in SRT format. Provide only the translation in plain SRT format without any code block or additional formatting:\n\n${changetext}` }
      ],
      model: "gpt-4o-mini-2024-07-18",
    });

    const hinglishText = completion.choices[0].message.content;
    return hinglishText;
  } catch (error) {
    console.error("Error translating text:", error);
  }
}



function generateSRT(words) {
  console.log(words, "srt");
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


app.listen(3000, () => console.log('Server running on port 3000'))




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
