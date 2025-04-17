require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const { OpenAI } = require('@azure/openai');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());


const azureOpenai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT
});

// Main endpoint
app.post('/api/smartclips', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;

    
    const videoPath = await downloadYouTubeVideo(youtubeUrl);
    
  
    const srtContent = await generateSRT(videoPath);
    
    const clipTimestamps = await analyzeSRTWithGPT(srtContent);
   
    const clipSRT = await processSRTForClip(srtContent, clipTimestamps.start, clipTimestamps.end);

    const clipPath = await extractClipWithFFmpeg(videoPath, clipTimestamps, clipSRT);
    
   
    await cleanupFiles([videoPath]);

    res.sendFile(clipPath);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
async function downloadYouTubeVideo(url) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', ['download_video.py', url]);
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.startsWith('VIDEO_PATH:')) {
        resolve(output.split(':')[1].trim());
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) reject(new Error(`Python script failed: ${errorOutput}`));
    });
  });
}

async function generateSRT(videoPath) {
  return `1
00:00:00,000 --> 00:00:04,000
Sample subtitle text for demonstration`;
}

async function analyzeSRTWithGPT(srtContent) {
  const prompt = `Analyze this SRT and suggest the best 60s viral clip. Respond with JSON:
  {"start": "00:00:00", "end": "00:01:00"}
  SRT Content:
  ${srtContent}`;

  const response = await azureOpenai.getChatCompletions('gpt-4', [{
    role: 'user',
    content: prompt
  }]);

  return JSON.parse(response.choices[0].message.content);
}

async function processSRTForClip(srtContent, clipStart, clipEnd) {
  const blocks = srtContent.split('\n\n');
  let filtered = [];
  let counter = 1;

  const toSeconds = (time) => {
    const [h, m, s] = time.split(':');
    return (+h * 3600) + (+m * 60) + (+s);
  };

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const [startTime, endTime] = lines[1].split(' --> ');
    const start = toSeconds(startTime.split(',')[0]);
    const end = toSeconds(endTime.split(',')[0]);

    if (end < toSeconds(clipStart) || start > toSeconds(clipEnd)) continue;

    const adjustedStart = Math.max(start - toSeconds(clipStart), 0);
    const adjustedEnd = Math.min(end - toSeconds(clipStart), toSeconds(clipEnd) - toSeconds(clipStart));

    filtered.push(
      `${counter}\n` +
      `${formatTime(adjustedStart)} --> ${formatTime(adjustedEnd)}\n` +
      lines.slice(2).join('\n')
    );
    counter++;
  }

  return filtered.join('\n\n');

  function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    return [
      date.getUTCHours().toString().padStart(2, '0'),
      date.getUTCMinutes().toString().padStart(2, '0'),
      date.getUTCSeconds().toString().padStart(2, '0')
    ].join(':') + ',000';
  }
}

async function extractClipWithFFmpeg(videoPath, timestamps, srtContent) {
  const clipName = `clip_${Date.now()}.mp4`;
  const clipPath = path.join(__dirname, 'clips', clipName);
  const srtPath = path.join(__dirname, 'clips', `temp_${Date.now()}.srt`);

  await fs.writeFile(srtPath, srtContent);

  const args = [
    '-y',
    '-ss', timestamps.start,
    '-to', timestamps.end,
    '-i', videoPath,
    '-vf', `subtitles=${srtPath}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff'`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    clipPath
  ];

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.stderr.on('data', (d) => console.error(d.toString()));
    ffmpeg.on('close', async (code) => {
      await fs.unlink(srtPath).catch(console.error);
      code === 0 ? resolve() : reject(new Error('FFmpeg failed'));
    });
  });

  return clipPath;
}

async function cleanupFiles(files) {
  for (const file of files) {
    await fs.unlink(file).catch(console.error);
  }
}

// Create necessary directories
async function initialize() {
  await fs.mkdir('downloads', { recursive: true });
  await fs.mkdir('clips', { recursive: true });
}

initialize().then(() => {
  app.listen(port, () => console.log(`Server running on port ${port}`));
});