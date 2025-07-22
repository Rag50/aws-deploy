import React from 'react';

export const SimpleVideoComposition = ({
  videoSrc,
  subtitles,
  font,
  watermark,
  soundEffects,
  userType,
  videoResolution,
  yPosition,
}) => {
  // Calculate video dimensions
  const getDimensions = () => {
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

  const { width, height } = getDimensions();

  // Main container style
  const containerStyle = {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  };

  // Video style
  const videoStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  // Subtitle style
  const subtitleStyle = {
    position: 'absolute',
    bottom: yPosition || 50,
    left: '50%',
    transform: 'translateX(-50%)',
    color: font.color || '#ffffff',
    fontSize: font.fontSize || 24,
    fontFamily: font.fontFamily || 'Arial',
    fontWeight: font.fontWeight || 'normal',
    fontStyle: font.fontStyle || 'normal',
    textAlign: 'center',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
    zIndex: 10,
    maxWidth: '90%',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };

  // Watermark style
  const watermarkStyle = {
    position: 'absolute',
    width: 120,
    height: 55,
    opacity: 0.8,
    zIndex: 5,
    ...(videoResolution === '16:9' && { top: 120, right: 120 }),
    ...(videoResolution === '1:1' && { top: 100, right: 100 }),
    ...(videoResolution === '9:16' && { top: 120, right: 50 }),
  };

  return (
    <div style={containerStyle}>
      {/* Main Video */}
      <video src={videoSrc} style={videoStyle} />
      
      {/* Watermark for free users */}
      {userType === 'free' && watermark && (
        <img src={watermark} alt="watermark" style={watermarkStyle} />
      )}
      
      {/* Subtitles */}
      {subtitles && subtitles.map((subtitle, index) => (
        <div key={index} style={subtitleStyle}>
          {subtitle.value}
        </div>
      ))}
    </div>
  );
}; 