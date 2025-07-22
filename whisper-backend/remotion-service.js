const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');
const temp = require('temp');
const https = require('https');
const http = require('http');
const axios = require('axios');

class RemotionVideoService {
  constructor() {
    this.bundled = null;
    this.tempDir = temp.mkdirSync('remotion-temp');
    this.azureDownloadDir = path.join(__dirname, 'azuredown');
    
    // Create azuredown directory if it doesn't exist
    if (!fs.existsSync(this.azureDownloadDir)) {
      fs.mkdirSync(this.azureDownloadDir, { recursive: true });
    }
  }

  async initializeBundler() {
    if (!this.bundled) {
      console.log('Bundling Remotion project...');
      this.bundled = await bundle({
        entryPoint: path.join(__dirname, 'remotion/index.jsx'),
        webpackOverride: (config) => {
          return {
            ...config,
            resolve: {
              ...config.resolve,
              alias: {
                ...config.resolve?.alias,
                '@': __dirname,
              },
            },
          };
        },
      });
      console.log('Remotion project bundled successfully');
    }
    return this.bundled;
  }

  async downloadVideoFromAzure(videoUrl) {
    try {
      if (!videoUrl || typeof videoUrl !== 'string') {
        console.log('No video URL provided, skipping download');
        return null;
      }

      console.log('Starting video download from Azure:', videoUrl);
      
      const fileName = `video_${Date.now()}.mp4`;
      const localPath = path.join(this.azureDownloadDir, fileName);
      
      console.log('Downloading to local path:', localPath);

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        timeout: 120000, // Increased to 2 minutes timeout
        maxContentLength: 1024 * 1024 * 1024, // 1GB max file size
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers['content-length']);

      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);

      let downloadedBytes = 0;
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes % (1024 * 1024) === 0) { // Log every MB
          console.log(`Downloaded: ${Math.round(downloadedBytes / (1024 * 1024))}MB`);
        }
      });

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log('Video download completed successfully');
          console.log('Final file size:', fs.statSync(localPath).size, 'bytes');
          console.log('Local file path:', localPath);
          
          // Verify file exists and has content
          if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            resolve(localPath);
          } else {
            reject(new Error('Downloaded file is empty or does not exist'));
          }
        });

        writer.on('error', (error) => {
          console.error('Error writing video file:', error);
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
          reject(error);
        });

        response.data.on('error', (error) => {
          console.error('Error downloading video:', error);
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
          reject(error);
        });

        // Add timeout for the entire download process
        const downloadTimeout = setTimeout(() => {
          console.error('Download timeout after 2 minutes');
          writer.destroy();
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
          reject(new Error('Download timeout'));
        }, 120000); // 2 minutes

        writer.on('finish', () => {
          clearTimeout(downloadTimeout);
        });
      });
    } catch (error) {
      console.error('Error downloading video from Azure:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return null;
    }
  }

  async renderVideo({
    videoSrc,
    subtitles,
    font,
    watermark,
    soundEffects,
    userType,
    videoResolution,
    yPosition,
    outputPath,
    fps = 24, // Reduced for smoother rendering
    quality = 75, // Balanced quality for performance
  }) {
    let downloadedVideoPath = null;
    let publicVideoPath = null;
    
    try {
      console.log('Starting renderVideo with videoSrc:', videoSrc);
      
      // Download video from Azure if it's a URL
      if (videoSrc && (videoSrc.startsWith('http://') || videoSrc.startsWith('https://'))) {
        console.log('Detected remote video URL, starting download...');
        downloadedVideoPath = await this.downloadVideoFromAzure(videoSrc);
        if (downloadedVideoPath) {
          console.log('Video downloaded successfully, local path:', downloadedVideoPath);
          console.log('File exists:', fs.existsSync(downloadedVideoPath));
          console.log('File size:', fs.statSync(downloadedVideoPath).size, 'bytes');
          
          // Get filename for copying
          const filename = path.basename(downloadedVideoPath);
          
          // Copy video to a location served by the main server (port 3000)
          const mainServerPublicDir = path.join(__dirname, 'public');
          if (!fs.existsSync(mainServerPublicDir)) {
            fs.mkdirSync(mainServerPublicDir, { recursive: true });
          }
          
          const mainServerVideoPath = path.join(mainServerPublicDir, filename);
          fs.copyFileSync(downloadedVideoPath, mainServerVideoPath);
          console.log('Video copied to main server public directory:', mainServerVideoPath);
          
          // Also copy to remotion/public for staticFile compatibility
          const publicDir = path.join(__dirname, 'remotion', 'public');
          publicVideoPath = path.join(publicDir, filename);
          
          // Ensure public directory exists
          if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
          }
          
          // Copy the video to public directory
          fs.copyFileSync(downloadedVideoPath, publicVideoPath);
          console.log('Video copied to public directory:', publicVideoPath);
          
          // Use the filename for Remotion (it will be served from port 3000)
          console.log('Video source for Remotion (filename):', filename);
          
          // Clean up the original downloaded file
          fs.unlinkSync(downloadedVideoPath);
          downloadedVideoPath = publicVideoPath; // Update for cleanup later
          
          videoSrc = filename; // Use filename, will be served from port 3000
        } else {
          console.log('Video download failed, proceeding with fallback rendering (no video)');
          videoSrc = null;
        }
      } else if (videoSrc) {
        // If it's already a local path, use it directly
        console.log('Using local video path:', videoSrc);
      } else {
        console.log('No video source provided, using fallback rendering');
      }

      console.log('Initializing Remotion bundler...');
      const bundleLocation = await this.initializeBundler();
      
      // Calculate video dimensions
      const getDimensions = (resolution) => {
        switch (resolution) {
          case '16:9':
            return { width: 1920, height: 1080 };
          case '1:1':
            return { width: 1080, height: 1080 };
          case '9:16':
            return { width: 720, height: 1280 };
          default:
            return { width: 1280, height: 720 };
        }
      };

      const { width, height } = getDimensions(videoResolution);
      console.log('Video dimensions:', width, 'x', height);
      
      // Calculate duration from video or subtitles
      // Use the public video path if available, otherwise use original videoSrc
      const videoFileForDuration = publicVideoPath || videoSrc;
      const duration = await this.getVideoDuration(videoFileForDuration, subtitles);
      const durationInFrames = Math.ceil(duration * fps);

      console.log(`Video duration: ${duration}s, frames: ${durationInFrames}`);

      // Get composition
      console.log('Selecting composition...');
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'VideoComposition',
        inputProps: {
          videoSrc: videoSrc, // Use the filename or original path
          subtitles,
          font,
          watermark: userType === 'free' ? watermark : null,
          soundEffects: soundEffects || [],
          userType,
          videoResolution,
          yPosition,
        },
      });

      console.log('Composition selected successfully');
      console.log('Starting Remotion render...');
      
      // Render the video
      const result = await renderMedia({
        composition: {
          ...composition,
          width,
          height,
          fps,
          durationInFrames,
        },
        serveUrl: bundleLocation,
        codec: 'h264',
        videoBitrate: '2M', // Moderate bitrate for quality/performance balance
        encodingMaxRate: '4M',
        encodingBufferSize: '8M',
        audioCodec: 'aac', // Ensure audio codec is specified
        audioBitrate: '128k', // Standard audio bitrate
        outputLocation: outputPath,
        inputProps: {
          videoSrc: videoSrc, // Use the filename or original path
          subtitles,
          font,
          watermark: userType === 'free' ? watermark : null,
          soundEffects: soundEffects || [],
          userType,
          videoResolution,
          yPosition,
        },
        imageFormat: 'jpeg',
        jpegQuality: quality,
        verbose: true,
        chromiumOptions: {
          headless: true,
          disableWebSecurity: true,
          ignoreCertificateErrors: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--run-all-compositor-stages-before-draw',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--disable-safebrowsing',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-features=VizDisplayCompositor',
            '--disable-features=TranslateUI',
            '--disable-features=BlinkGenPropertyTrees',
          ],
        },
        delayRenderTimeoutInMilliseconds: 60000, // Increased to 60 seconds
        timeoutInMilliseconds: 300000, // Increased to 5 minutes
        concurrency: 1, // Single thread for stability
        onProgress: (progress) => {
          if (!isNaN(progress)) {
            console.log(`Rendering progress: ${Math.round(progress * 100)}%`);
          }
        },
      });

      console.log('Remotion render completed successfully');
      return { success: true, outputPath, downloadedVideoPath: publicVideoPath };
    } catch (error) {
      console.error('Error in Remotion render:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
    // Don't clean up the downloaded file here - let the caller handle it
  }

  async checkVideoAccessibility(videoSrc) {
    try {
      if (!videoSrc || typeof videoSrc !== 'string') {
        return false;
      }

      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(videoSrc);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      return new Promise((resolve) => {
        const req = protocol.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'HEAD',
          timeout: 10000, // 10 second timeout
        }, (res) => {
          resolve(res.statusCode === 200);
        });
        
        req.on('error', (err) => {
          console.error('Video accessibility check failed:', err.message);
          resolve(false);
        });
        
        req.on('timeout', () => {
          console.error('Video accessibility check timed out');
          req.destroy();
          resolve(false);
        });
        
        req.end();
      });
    } catch (error) {
      console.error('Error checking video accessibility:', error);
      return false;
    }
  }

  async getVideoDuration(videoSrc, subtitles) {
    // If no video source, fallback to subtitle duration
    if (!videoSrc) {
      return this.getMaxSubtitleTime(subtitles);
    }

    // Try to get duration from video file first
    try {
      const ffmpeg = require('fluent-ffmpeg');
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoSrc, (err, metadata) => {
          if (err) {
            // Fallback to subtitle duration
            const maxTime = this.getMaxSubtitleTime(subtitles);
            resolve(maxTime);
          } else {
            resolve(metadata.format.duration);
          }
        });
      });
    } catch (error) {
      // Fallback to subtitle duration
      return this.getMaxSubtitleTime(subtitles);
    }
  }

  getMaxSubtitleTime(subtitles) {
    if (!subtitles || subtitles.length === 0) return 30; // Default 30 seconds
    
    let maxTime = 0;
    subtitles.forEach(subtitle => {
      const timeEnd = subtitle.timeEnd || subtitle.end;
      if (timeEnd) {
        const seconds = this.timeStringToSeconds(timeEnd);
        maxTime = Math.max(maxTime, seconds);
      }
    });
    
    return maxTime || 30; // Default to 30 seconds if no valid times found
  }

  timeStringToSeconds(timeString) {
    if (!timeString) return 0;
    
    // Handle format like "00:00:05,500" or "00:00:05.500"
    const parts = timeString.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const secondsPart = parts[2].replace(',', '.');
      const seconds = parseFloat(secondsPart) || 0;
      
      return hours * 3600 + minutes * 60 + seconds;
    }
    
    return 0;
  }

  // Enhanced subtitle processing with animations
  processSubtitles(subtitles, isOneWord = false) {
    return subtitles.map((subtitle, index) => {
      // Extract emojis from text
      const emojis = this.extractEmojis(subtitle.value);
      
      // Keep original text with emojis for display
      const originalText = subtitle.value;

      return {
        ...subtitle,
        value: originalText, // Keep original text with emojis
        emojis,
        animationType: isOneWord ? 'bounce' : 'slideUp',
        hasEmojis: emojis.length > 0,
      };
    });
  }

  extractEmojis(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{1F000}-\u{1F02B}]/gu;
    return text.match(emojiRegex) || [];
  }

  // Add sound effects processing
  processSoundEffects(soundEffects) {
    return soundEffects.map(effect => ({
      ...effect,
      startTime: effect.timestamp / 1000, // Convert to seconds
      volume: effect.volume || 1.0,
      fadeIn: effect.fadeIn || 0,
      fadeOut: effect.fadeOut || 0,
    }));
  }

  async cleanup() {
    try {
      if (this.tempDir && fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log('Cleaned up temp directory:', this.tempDir);
      }
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  }

  cleanupDownloadedVideo(downloadedVideoPath) {
    try {
      if (downloadedVideoPath && fs.existsSync(downloadedVideoPath)) {
        fs.unlinkSync(downloadedVideoPath);
        console.log('Cleaned up downloaded video file:', downloadedVideoPath);
      }
    } catch (error) {
      console.error('Error cleaning up downloaded video:', error);
    }
  }

  async cleanupOldDownloads() {
    try {
      if (!fs.existsSync(this.azureDownloadDir)) {
        return;
      }

      const files = fs.readdirSync(this.azureDownloadDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.azureDownloadDir, file);
        const stats = fs.statSync(filePath);
        
        // Delete files older than 1 hour
        if (now - stats.mtime.getTime() > 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
          console.log('Cleaned up old download:', filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old downloads:', error);
    }
  }
}

module.exports = RemotionVideoService; 