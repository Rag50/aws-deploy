require('dotenv').config();
const express = require('express');
const { spawn, exec } = require('child_process');
const { OpenAI } = require('@azure/openai');
const fs = require('fs').promises;
const fsf = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const FormData = require('form-data');
const axios = require('axios');
const { tmpName } = require('tmp-promise');
const SrtParser = require('srt-parser-2').default; // Fixed initialization
const parser = new SrtParser();
const ffmpeg = require('fluent-ffmpeg');
const FFMPEG_PATH = 'ffmpeg';

app.use(express.json());
const pythonPath = path.join(__dirname, 'venv', 'bin', 'python');
let SRT_CONTENT = '';
const INPUT_VIDEO_PATH = 'downloads/IRF-7Vq-UAU.mp4';

// gcp setup with cleanup
app.post('/api/smartclips', async (req, res) => {
    try {
        const { youtubeUrl } = req.body;


        const videoPath = await downloadYouTubeVideo(youtubeUrl);
    
        let isoneWord = false

        let transcription = await processVideoInput(videoPath, isoneWord);

        let srtContent;

        console.log("Ran");
        if (isoneWord) {
            srtContent = generateSRTFromWords(transcription.words);
        } else {
            srtContent = generateSRTNormal(transcription.segments, 4);
        }

        console.log(srtContent, 'real srt');

        SRT_CONTENT = srtContent;

        const clipTimestamps = await analyzeSRTWithGPT(srtContent);
        console.log(clipTimestamps);



        const sampleClips = {
            clips: [
                { start: "00:04:58", end: "00:05:58", reason: "conflict_resolution" },
            ]

        };

        //         "clips": [
        //     {
        //       "start": "00:00:17",
        //       "end": "00:01:17",
        //       "reason": "emotional_peak"
        //     },
        //     {
        //       "start": "00:01:36",
        //       "end": "00:02:36",
        //       "reason": "humorous_exchange"
        //     },
        //     {
        //       "start": "00:02:54",
        //       "end": "00:03:54",
        //       "reason": "surprising_twist"
        //     },
        //     {
        //       "start": "00:04:58",
        //       "end": "00:05:58",
        //       "reason": "conflict_resolution"
        //     },
        //     {
        //       "start": "00:06:30",
        //       "end": "00:07:30",
        //       "reason": "visually_striking_scene"
        //     }
        //   ]

        processClips(sampleClips)
            .then(results => console.log('Processing complete:', results))
            .catch(err => console.error('Main error:', err));

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

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

function secondsToSRTTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12); // Get "HH:MM:SS.mmm"
    return time.replace('.', ','); // Replace dot with comma for SRT format
}

async function callWhisper(audioFilePath, isoneWord) {
    console.log(audioFilePath);
    const url = `https://capsaiendpoint.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-02-15-preview`; // Changed to transcriptions and updated API version

    const formData = new FormData();
    formData.append('file', fsf.createReadStream(audioFilePath), { filename: 'audio.wav' });
    formData.append('response_format', 'verbose_json');

    if (isoneWord) {
        formData.append('timestamp_granularities[]', 'word');
    }

    const headers = {
        ...formData.getHeaders(),
        'api-key': '',
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

async function processVideoInput(videoFilePath, isoneWord) {
    console.log('IN Code')
    try {

        console.log('Extracting audio from video...');
        const audioFilePath = 'downloads/extracted-audio.wav';
        await extractAudioFromVideo(videoFilePath, audioFilePath);
        // one word stucking after audio extraction 


        console.log('Sending audio to Whisper API...');
        const srtContent = await callWhisper(audioFilePath, isoneWord);
        console.log('Whisper Transcription (SRT):\n', srtContent);


        fsf.unlinkSync(audioFilePath);
        console.log('Temporary audio file deleted.');

        return srtContent;
    } catch (error) {
        console.error('Error processing video input:', error);
        throw error;
    }
}

// Helper functions
// async function downloadYouTubeVideo(url) {
//     return new Promise((resolve, reject) => {
//         const pythonProcess = spawn(pythonPath, ['download_video.py', url]);
//         let errorOutput = '';

//         pythonProcess.stdout.on('data', (data) => {
//             const output = data.toString().trim();
//             if (output.startsWith('VIDEO_PATH:')) {
//                 resolve(output.split(':')[1].trim());
//             }
//         });

//         pythonProcess.stderr.on('data', (data) => {
//             errorOutput += data.toString();
//         });

//         pythonProcess.on('close', (code) => {
//             if (code !== 0) reject(new Error(`Python script failed: ${errorOutput}`));
//         });
//     });
// }

async function downloadYouTubeVideo(url) {
    return new Promise((resolve, reject) => {
        const python = spawn('python3', ['path/to/download_script.py', url]);

        let videoPath = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.startsWith('VIDEO_PATH:')) {
                videoPath = output.replace('VIDEO_PATH:', '').trim();
            }
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0 && videoPath) {
                resolve(videoPath);
            } else {
                reject(new Error(`Download failed: ${errorOutput}`));
            }
        });
    });
}

async function generateSRT(videoPath) {
    return `1
00:00:00,000 --> 00:00:04,000
Sample subtitle text for demonstration`;
}

async function analyzeSRTWithGPT(srtContent) {
    const prompt = `Analyze this SRT file and suggest 4-5 potential viral clips (exactly 60s each). Follow these rules:
1. Identify different types of viral moments:
   - Humorous exchanges
   - Emotional peaks (drama, inspiration)
   - Surprising twists/revelations
   - Visually striking scenes
   - Conflict/resolution moments
2. Ensure NO overlap between clips
3. Prioritize self-contained segments that make sense out of context
4. Include exact timestamps matching subtitle boundaries

SRT format example:
1
00:00:04,000 --> 00:00:08,000
[Subtitle text]

2
00:00:09,500 --> 00:00:13,200
[More dialogue]

Current SRT Content:
"""
${srtContent}
"""

Respond STRICTLY with JSON in this format:
{
  "clips": [
    {
      "start": "HH:MM:SS", 
      "end": "HH:MM:SS",
      "reason": "brief_viral_factor"
    },
    ...(4-5 entries)
  ]
}`;


    const url = `https://capsaiendpoint.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-08-01-preview`;

    const data = {
        messages: [
            { role: 'user', content: prompt }
        ],
        response_format: { "type": "json_object" }
    };

    const headers = {
        'Content-Type': 'application/json',
        'api-key': '',
    };

    try {
        const response = await axios.post(url, data, { headers });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling GPT-4:', error.response ? error.response.data : error.message);
        throw error;
    }
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





function srtTimeToSeconds(timeStr) {
    // Handle both comma and millisecond formats
    const cleanTime = timeStr.replace(',', '.').replace(/;/g, ':');
    const parts = cleanTime.split(':');

    // Convert HH:MM:SS.mmm to total seconds
    let seconds = 0;
    if (parts.length === 3) { // HH:MM:SS.mmm
        seconds += parseInt(parts[0]) * 3600;
        seconds += parseInt(parts[1]) * 60;
        seconds += parseFloat(parts[2]);
    } else if (parts.length === 2) { // MM:SS.mmm
        seconds += parseInt(parts[0]) * 60;
        seconds += parseFloat(parts[1]);
    }

    return seconds;
}

// Generate filtered SRT for clip
async function createClipSubtitles(clipStart, clipEnd, subtitles) {
    const EPSILON = 0.001; // 1ms threshold for boundary checks

    // Convert all subtitles to seconds with milliseconds
    const allSubs = subtitles.map(sub => ({
        original: sub,
        start: srtTimeToSeconds(sub.startTime),
        end: srtTimeToSeconds(sub.endTime),
        text: sub.text
    }));

    // Debug: Log all subtitles and clip boundaries
    console.log(`Clip boundaries: ${clipStart.toFixed(3)}-${clipEnd.toFixed(3)}`);
    console.log('All subtitles:', allSubs.map(s =>
        `${s.start.toFixed(3)}-${s.end.toFixed(3)}: "${s.text}"`
    ));

    // Accurate overlap detection with epsilon
    const filtered = allSubs.filter(({ start, end }) => {
        return (
            (start > clipStart - EPSILON && start < clipEnd + EPSILON) ||
            (end > clipStart - EPSILON && end < clipEnd + EPSILON) ||
            (start <= clipStart && end >= clipEnd)
        );
    });

    if (filtered.length === 0) {
        console.error('No matching subtitles found despite apparent overlap');
        return '';
    }

    // Merge subtitles with overlapping or adjacent timing
    const merged = [];
    let current = null;

    filtered.sort((a, b) => a.start - b.start).forEach(sub => {
        if (!current) {
            current = { ...sub };
        } else if (sub.start <= current.end + EPSILON) {
            current.text += sub.text.trim() ? ` ${sub.text.trim()}` : '';
            current.end = Math.max(current.end, sub.end);
        } else {
            merged.push(current);
            current = { ...sub };
        }
    });
    if (current) merged.push(current);

    // Adjust timestamps relative to clip start
    return merged.map((sub, index) => {
        const start = Math.max(sub.start - clipStart, 0);
        const end = Math.min(sub.end - clipStart, clipEnd - clipStart);

        // Handle zero-length subtitles (single frame)
        const finalEnd = end > start ? end : start + 0.001;

        return {
            id: index + 1,
            startTime: formatSrtTime(start),
            endTime: formatSrtTime(finalEnd),
            text: sub.text
        };
    });
}


function formatSrtTime(seconds) {
    const ms = Math.round((seconds % 1) * 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

// Execute ffmpeg command
function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(FFMPEG_PATH, args);
        let errorOutput = '';

        ffmpeg.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg failed: ${errorOutput}`));
            }
        });
    });
}

// Process single clip
async function processClip(clip, subtitles) {
    console.log(subtitles, 'fffff');
    const clipStart = srtTimeToSeconds(clip.start);
    const clipEnd = srtTimeToSeconds(clip.end);
    const duration = clipEnd - clipStart;

    const tempSrtPath = path.join(__dirname, 'downloads', 'temp.srt');;
    const tempVideoPath = path.join(__dirname, 'downloads', 'temp.mp4');

    try {
        // Create filtered SRT
        const subs = await createClipSubtitles(clipStart, clipEnd, subtitles);

        if (subs.length === 0) {
            throw new Error('No subtitles found in clip duration');
        }

        console.log(subs);

        const srtContent = subs.map(sub =>
            `${sub.id}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`
        ).join('\n\n');

        await fs.writeFile(tempSrtPath, srtContent);

        // Build ffmpeg command
        const args = [
            '-y',
            '-ss', clip.start,
            '-i', INPUT_VIDEO_PATH,
            '-t', duration.toFixed(3),
            '-vf', `subtitles=${tempSrtPath}:force_style='FontName=Arial,Fontsize=20'`,
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            tempVideoPath
        ];

        await runFFmpeg(args);

        // Upload to Azure
        //   const blobName = `${clip.reason}_${clip.start}-${clip.end}.mp4`
        //     .replace(/:/g, '-')
        //     .replace(/\s+/g, '_');

        //   const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
        //   const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        //   const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        //   await blockBlobClient.uploadFile(tempVideoPath, {
        //     blobHTTPHeaders: { blobContentType: 'video/mp4' }
        //   });

        return { ...clip };
    } finally {
        await Promise.allSettled([
            // fs.unlink(tempSrtPath).catch(() => {}),
            // fs.unlink(tempVideoPath).catch(() => {})
        ]);
    }
}

// Main processing
async function processClips(clips) {
    const subtitles = parser.fromSrt(SRT_CONTENT);

    for (const clip of clips.clips) {
        try {
            const result = await processClip(clip, subtitles);
            console.log(`Processed clip: ${result.url}`);
        } catch (error) {
            console.error(`Failed to process ${clip.start}-${clip.end}:`, error.message);
        }
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