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
  apiKey: "key ",
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


    const transcription = await transcribeVideo(videoPath)
    console.log(transcription);
    const srtContent = generateSRT(transcription.words);

    const hindi = await convertHindiToHinglish(srtContent, transcription.language);
    console.log(hindi);

    const formatedcaptions = formatSubtitle(hindi);


    const srtFilePath = path.join(__dirname, 'uploads', `${req.file.filename}.srt`);
    fs.writeFileSync(srtFilePath, hindi);


    const outputFilePath = path.join(__dirname, 'uploads', `${req.file.filename}_output.mp4`);
    const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${srtFilePath}" ${outputFilePath}`;
    require('child_process').execSync(ffmpegCommand);

    fs.unlinkSync(srtFilePath);


    res.json({ videoUrl: `http://localhost:3000/uploads/${req.file.filename}_output.mp4`, transcription: formatedcaptions, rawData: transcription.words, inputFile: videoPath, lang: transcription.language });
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})


app.post('/api/change-style', upload.single('video'), async (req, res) => {

  try {
    const { videoUrl, font, color, xPosition, yPosition, raw, lang } = req.body;
    console.log(videoUrl, font, color, xPosition, yPosition, raw, lang);
    const watermarkPath = path.join(__dirname, 'watermarks', 'watermark.svg');


    if (!videoUrl || !font || !color || !xPosition || !yPosition || !raw) {
      return res.status(400).json({ error: 'Missing required fields in the request body' });
    }
    const videoPath = path.join(__dirname, videoUrl);
    const srtContent = generateSRT(raw);
    const hindi = await convertHindiToHinglish(srtContent, lang);

    const srtFilePath = path.join(__dirname, 'uploads', `temp.srt`);
    fs.writeFileSync(srtFilePath, hindi);


    const outputFilePath = videoPath.replace('.mp4', `l.mp4_output.mp4`);
    await new Promise((resolve, reject) => {
      const ffmpegCommand = `ffmpeg -i ${videoPath} -i ${watermarkPath} -filter_complex "[1:v] scale=254:118.54 [watermark]; [0:v][watermark] overlay=135:426, subtitles=${srtFilePath}:force_style='Fontname=${font},PrimaryColour=&H${color.slice(1)}&,Alignment=2,MarginV=${yPosition},MarginL=${xPosition}'" -c:a copy ${outputFilePath}`;
      exec(ffmpegCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });

    fs.unlinkSync(srtFilePath)
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
    const words = valueLine.split(' ');

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

function parseTimecode(timecode) {
  const [hours, minutes, secondsAndMs] = timecode.split(':');
  const [seconds, milliseconds] = secondsAndMs.split(',');

  return (
    parseInt(hours) * 3600 +
    parseInt(minutes) * 60 +
    parseInt(seconds) +
    parseInt(milliseconds) / 1000
  );
}

function formatTimecode(seconds) {
  const date = new Date(0);
  date.setSeconds(seconds);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const secondsPart = date.getUTCSeconds().toString().padStart(2, '0');
  const milliseconds = (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5);
  return `${hours}:${minutes}:${secondsPart},${milliseconds}`;
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
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Translate the following ${language} text to Hinglish. If the  ${language} is already in English, do not change it. Do not add any comments, only provide the translation:\n\n${changetext}` }
      ],
      model: "gpt-4o",
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