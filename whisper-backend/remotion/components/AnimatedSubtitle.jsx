import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

export const AnimatedSubtitle = ({
  text,
  font,
  yPosition,
  videoDimensions,
  animationType,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation configurations
  const getAnimation = () => {
    switch (animationType) {
      case 'slideUp':
        return {
          transform: `translateY(${interpolate(frame, [0, 10], [30, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}px)`,
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      case 'fade':
        return {
          opacity: interpolate(frame, [0, 8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      case 'bounce':
        const bounceValue = spring({
          fps,
          frame,
          config: {
            damping: 15,
            stiffness: 150,
            mass: 0.8,
          },
        });
        return {
          transform: `scale(${bounceValue})`,
          opacity: interpolate(frame, [0, 5], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      case 'typewriter':
        const charsVisible = Math.floor(
          interpolate(frame, [0, 20], [0, text.length], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        );
        return {
          width: 'fit-content',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          content: text.substring(0, charsVisible),
        };
      default:
        return {};
    }
  };

  const animation = getAnimation();

  // Text styling with shadow and stroke support
  const textStyle = {
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
    color: font.color,
    fontWeight: font.fontWeight,
    fontStyle: font.fontStyle,
    letterSpacing: font.letterSpacing || '0px',
    textAlign: 'center',
    position: 'absolute',
    left: '50%',
    bottom: '15%', // Position from bottom for better visibility
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    textShadow: font.textShadow || '2px 2px 4px rgba(0,0,0,0.8)',
    WebkitTextStroke: font.webkitTextStrokeWidth 
      ? `${font.webkitTextStrokeWidth} ${font.webkitTextStrokeColor || '#000000'}`
      : 'none',
    padding: font.padding || '10px 20px',
    zIndex: 100, // Increased z-index to ensure subtitles appear above all effects
    maxWidth: '90%',
    lineHeight: 1.2,
    borderRadius: '4px',
    backgroundColor: 'rgba(0,0,0,0.4)', // Semi-transparent background for better readability
    ...animation,
  };

  // Word-by-word animation for typewriter effect
  if (animationType === 'typewriter') {
    const words = text.split(' ');
    const wordsVisible = Math.floor(
      interpolate(frame, [0, 60], [0, words.length], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    );

    return (
      <div style={textStyle}>
        {words.slice(0, wordsVisible).map((word, index) => (
          <span key={index} style={{ marginRight: '0.3em' }}>
            {word}
          </span>
        ))}
        {wordsVisible < words.length && (
          <span
            style={{
              borderRight: '2px solid ' + font.color,
              animation: 'blink 1s infinite',
            }}
          />
        )}
      </div>
    );
  }

  // Glow effect for enhanced visibility
  const glowStyle = {
    ...textStyle,
    position: 'absolute',
    color: 'transparent',
    textShadow: `0 0 20px ${font.color}80, 0 0 40px ${font.color}60`,
    zIndex: 99, // Just below the main text
    backgroundColor: 'transparent', // Remove background for glow effect
  };

  return (
    <>
      {/* Glow effect */}
      <div style={glowStyle}>{text}</div>
      
      {/* Main text */}
      <div style={textStyle}>{text}</div>
      
      {/* CSS for cursor blink animation */}
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>
    </>
  );
}; 