import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { SimpleVideoComposition } from './SimpleVideoComposition.jsx';
import { VideoComposition } from './VideoComposition.jsx';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="SimpleVideoComposition"
        component={SimpleVideoComposition}
        durationInFrames={720} // 30 seconds at 24fps
        fps={24}
        width={1920}
        height={1080}
        defaultProps={{
          videoSrc: "",
          subtitles: [],
          font: {
            fontFamily: 'Arial',
            fontSize: 32, // Increased default size
            color: '#ffffff',
            fontWeight: 'normal',
            fontStyle: 'normal',
          },
          watermark: null,
          soundEffects: [],
          userType: "free",
          videoResolution: "16:9",
          yPosition: 50,
        }}
      />
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        durationInFrames={720} // 30 seconds at 24fps
        fps={24}
        width={1920}
        height={1080}
        defaultProps={{
          videoSrc: "",
          subtitles: [],
          font: {
            fontFamily: 'Arial',
            fontSize: 32, // Increased default size
            color: '#ffffff',
            fontWeight: 'normal',
            fontStyle: 'normal',
          },
          watermark: null,
          soundEffects: [],
          userType: "free",
          videoResolution: "16:9",
          yPosition: 50,
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot); 