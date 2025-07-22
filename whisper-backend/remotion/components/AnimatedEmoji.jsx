import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';

export const AnimatedEmoji = ({
  emoji,
  position,
  animationType,
  delay = 0,
  size = 45,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Adjust frame with delay
  const adjustedFrame = Math.max(0, frame - delay);

  // Animation configurations
  const getAnimation = () => {
    switch (animationType) {
      case 'bounce':
        const bounceValue = spring({
          fps,
          frame: adjustedFrame,
          config: {
            damping: 8,
            stiffness: 150,
            mass: 1,
          },
        });
        return {
          transform: `scale(${bounceValue})`,
          opacity: interpolate(adjustedFrame, [0, 5], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      
      case 'rotate':
        const rotation = interpolate(adjustedFrame, [0, 60], [0, 360], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'extend',
        });
        return {
          transform: `rotate(${rotation}deg)`,
          opacity: interpolate(adjustedFrame, [0, 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      
      case 'pulse':
        const pulseScale = interpolate(
          adjustedFrame % 30, 
          [0, 15, 30], 
          [1, 1.2, 1], 
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }
        );
        return {
          transform: `scale(${pulseScale})`,
          opacity: interpolate(adjustedFrame, [0, 5], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      
      case 'slideIn':
        const slideX = interpolate(adjustedFrame, [0, 20], [50, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return {
          transform: `translateX(${slideX}px)`,
          opacity: interpolate(adjustedFrame, [0, 15], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      
      case 'zoom':
        const zoomValue = spring({
          fps,
          frame: adjustedFrame,
          config: {
            damping: 15,
            stiffness: 300,
            mass: 0.5,
          },
        });
        return {
          transform: `scale(${zoomValue})`,
          opacity: interpolate(adjustedFrame, [0, 3], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
      
      default:
        return {
          opacity: interpolate(adjustedFrame, [0, 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        };
    }
  };

  const animation = getAnimation();

  // Check if emoji is in the emoji mapping (for PNG files)
  const emojiMapping = {
    "🐣": "ALLEMOJIS/AnimalFaces/BabyChick.png",
    "🐻": "ALLEMOJIS/AnimalFaces/Bear.png",
    "🐦": "ALLEMOJIS/AnimalFaces/Bird.png",
    "🐗": "ALLEMOJIS/AnimalFaces/Boar.png",
    "🐱": "ALLEMOJIS/AnimalFaces/CatFace.png",
    "🐔": "ALLEMOJIS/AnimalFaces/Chicken.png",
    "🐮": "ALLEMOJIS/AnimalFaces/CowFace.png",
    "🐶": "ALLEMOJIS/AnimalFaces/DogFace.png",
    "🐲": "ALLEMOJIS/AnimalFaces/DragonFace.png",
    "🦊": "ALLEMOJIS/AnimalFaces/Fox.png",
    "🐸": "ALLEMOJIS/AnimalFaces/Frog.png",
    "🐹": "ALLEMOJIS/AnimalFaces/Hamster.png",
    "🙉": "ALLEMOJIS/AnimalFaces/HearNoEvilMonkey.png",
    "🐴": "ALLEMOJIS/AnimalFaces/HorseFace.png",
    "🐨": "ALLEMOJIS/AnimalFaces/Koala.png",
    "🦁": "ALLEMOJIS/AnimalFaces/Lion.png",
    "🐵": "ALLEMOJIS/AnimalFaces/MonkeyFace1.png",
    "🦌": "ALLEMOJIS/AnimalFaces/Moose.png",
    "🐭": "ALLEMOJIS/AnimalFaces/MouseFace.png",
    "🐼": "ALLEMOJIS/AnimalFaces/Panda.png",
    "🐧": "ALLEMOJIS/AnimalFaces/Penguin.png",
    "🐷": "ALLEMOJIS/AnimalFaces/PigFace.png",
    "🐽": "ALLEMOJIS/AnimalFaces/PigNose.png",
    "🐻‍❄️": "ALLEMOJIS/AnimalFaces/PolarBear.png",
    "🐰": "ALLEMOJIS/AnimalFaces/RabbitFace.png",
    "🙈": "ALLEMOJIS/AnimalFaces/SeeNoEvilMonkey.png",
    "🙊": "ALLEMOJIS/AnimalFaces/SpeakNoEvilMonkey.png",
    "🐯": "ALLEMOJIS/AnimalFaces/TigerFace.png",
    "🦄": "ALLEMOJIS/AnimalFaces/Unicorn.png",
    "🐺": "ALLEMOJIS/AnimalFaces/Wolf.png",
    // Add more emojis as needed...
  };

  const emojiPngPath = emojiMapping[emoji];

  const containerStyle = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: size,
    height: size,
    zIndex: 20,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
    ...animation,
  };

  // Enhanced glow effect for better visibility
  const glowStyle = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)`,
    zIndex: -1,
  };

  return (
    <div style={containerStyle}>
      {/* Glow effect */}
      <div style={glowStyle} />
      
      {/* Emoji content */}
      {emojiPngPath ? (
        <Img
          src={staticFile(emojiPngPath)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <div
          style={{
            fontSize: size * 0.8,
            lineHeight: 1,
            textAlign: 'center',
            userSelect: 'none',
          }}
        >
          {emoji}
        </div>
      )}
    </div>
  );
}; 