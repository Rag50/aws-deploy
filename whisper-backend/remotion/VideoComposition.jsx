import React from 'react';
import { Video, Audio, useVideoConfig, useCurrentFrame, interpolate, Sequence, staticFile } from 'remotion';

export const VideoComposition = ({
  videoSrc,
  subtitles,
  font,
  watermark,
  soundEffects,
  userType,
  videoResolution,
  yPosition,
}) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  // Calculate video dimensions based on resolution
  const getVideoDimensions = () => {
    switch (videoResolution) {
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

  const videoDimensions = getVideoDimensions();

  // Convert time string to frame number
  const timeToFrame = (timeString) => {
    const [hours, minutes, seconds] = timeString.split(':');
    const [secs, millis] = seconds.split(',');
    const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis) / 1000;
    return Math.round(totalSeconds * fps);
  };

  // Extract emojis from text - simplified and more reliable
  const extractEmojis = (text) => {
    // Simple emoji detection - look for common emoji characters
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{1F000}-\u{1F02B}]/gu;
    const emojis = text.match(emojiRegex) || [];
    
    // Also check for specific common emojis that might be missed
    const commonEmojis = ['🎉', '🚀', '😊', '👍', '❤️', '🔥', '⭐', '🎯', '💯', '✨', '🎊', '🎈', '🎁', '🎂', '🎄', '🎃', '🎭', '🎨', '🎪', '🎟️', '🎫', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎸', '🎺', '🎻', '🎷', '🎸', '🎹', '🎺', '🎻', '🎷', '🎸', '🎹', '🎺', '🎻', '🎷'];
    
    const foundEmojis = [...emojis];
    commonEmojis.forEach(emoji => {
      if (text.includes(emoji) && !foundEmojis.includes(emoji)) {
        foundEmojis.push(emoji);
      }
    });
    
    return foundEmojis;
  };

  // Simple subtitle component with emoji support
  const SimpleSubtitle = ({ text, font, startFrame, endFrame }) => {
    if (frame < startFrame || frame > endFrame) return null;
    
    // Simple fade in animation only - reduced complexity
    const opacity = frame < startFrame + 3 ? 
      interpolate(frame, [startFrame, startFrame + 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;

    const emojis = extractEmojis(text);
    const cleanText = text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{1F000}-\u{1F02B}]/gu, '').trim();

    return (
      <>
        {/* Main subtitle text */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '15%',
            transform: 'translateX(-50%)',
            color: font.color,
            fontSize: Math.max(font.fontSize * 1.5, 36), // Make text larger
            fontFamily: font.fontFamily,
            fontWeight: font.fontWeight,
            textAlign: 'center',
            textShadow: '3px 3px 6px rgba(0,0,0,0.9)', // Stronger shadow for larger text
            backgroundColor: 'rgba(0,0,0,0.6)', // Slightly more opaque background
            padding: '12px 20px', // More padding for larger text
            borderRadius: '6px',
            zIndex: 100,
            opacity,
            whiteSpace: 'nowrap',
            maxWidth: '90%',
          }}
        >
          {cleanText}
        </div>

        {/* Emojis positioned above subtitle - same size as text */}
        {emojis.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '25%',
              transform: 'translateX(-50%)',
              fontSize: Math.max(font.fontSize * 1.5, 36), // Same size as text
              zIndex: 101,
              opacity,
              textAlign: 'center',
              textShadow: '3px 3px 6px rgba(0,0,0,0.9)', // Same shadow as text
              backgroundColor: 'rgba(0,0,0,0.6)', // Same background as text
              padding: '8px 16px',
              borderRadius: '6px',
            }}
          >
            {emojis.join(' ')}
          </div>
        )}
      </>
    );
  };

  // Helper function to get watermark position
  const getWatermarkPosition = (resolution) => {
    switch (resolution) {
      case '16:9':
        return { top: 120, right: 120 };
      case '1:1':
        return { top: 100, right: 100 };
      case '9:16':
        return { top: 120, right: 50 };
      default:
        return { top: 50, right: 50 };
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Main Video with Audio */}
      {videoSrc ? (
        <Video
          src={videoSrc.startsWith('http') ? videoSrc : staticFile(videoSrc)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted={false} // Enable audio
          playsInline
          volume={1}
          // Remove problematic attributes that might cause hanging
          onError={(error) => {
            console.error('Video loading error:', error);
          }}
        />
      ) : (
        // Simple fallback background
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              color: '#ffffff',
              fontSize: '48px',
              fontFamily: 'Arial, sans-serif',
              textAlign: 'center',
              opacity: 0.8,
            }}
          >
            Video Processing
          </div>
        </div>
      )}

      {/* Watermark for free users */}
      {userType === 'free' && watermark && (
        <div
          style={{
            position: 'absolute',
            ...getWatermarkPosition(videoResolution),
            width: 120,
            height: 55,
            opacity: 0.8,
            zIndex: 5,
          }}
        >
          <img
            src={watermark.startsWith('http') ? watermark : staticFile(watermark)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      {/* Subtitles with Emojis */}
      {subtitles.map((subtitle, index) => {
        const startFrame = timeToFrame(subtitle.timeStart);
        const endFrame = timeToFrame(subtitle.timeEnd);

        return (
          <SimpleSubtitle
            key={subtitle.id || index}
            text={subtitle.value}
            font={font}
            startFrame={startFrame}
            endFrame={endFrame}
          />
        );
      })}

      {/* Sound Effects */}
      {soundEffects.map((effect, index) => {
        const startFrame = Math.round((effect.timestamp / 1000) * fps);
        
        return (
          <Sequence
            key={`sound-${index}`}
            from={startFrame}
            durationInFrames={30}
          >
            <Audio src={effect.file.startsWith('http') ? effect.file : staticFile(effect.file)} />
          </Sequence>
        );
      })}
    </div>
  );
}; 