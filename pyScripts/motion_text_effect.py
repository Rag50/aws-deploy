from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip
from PIL import Image, ImageDraw, ImageFont
import srt
import numpy as np
import os

def parse_srt(srt_file):
    """Parse SRT file and return list of subtitle entries"""
    with open(srt_file, 'r', encoding='utf-8') as f:
        srt_content = f.read()
    return list(srt.parse(srt_content))

def create_subtitle_frame(text, size, highlighted_word=None):
    """Create a PIL Image with large, clear subtitles"""
  
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    
    font_size = int(size[1] * 0.02)  
    try:
       
        font = ImageFont.truetype("Arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("Arial Unicode MS.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("LiberationSans-Bold.ttf", font_size)
            except:
                font = ImageFont.load_default(size=font_size)

  
    dummy_bbox = draw.textbbox((0, 0), text, font=font)
    text_height = dummy_bbox[3] - dummy_bbox[1]
    
   
    y_position = int(size[1] * 0.85) - text_height
    
   
    bg_padding = 20
    bg_bbox = (
        0,
        y_position - bg_padding,
        size[0],
        y_position + text_height + bg_padding
    )
    draw.rectangle(bg_bbox, fill=(0, 0, 0, 200))  
    
   
    text_x = (size[0] - draw.textlength(text, font=font)) // 2
    
    if highlighted_word and highlighted_word in text:
      
        parts = text.split(highlighted_word)
        x = text_x
        for i, part in enumerate(parts):
            draw.text((x, y_position), part, fill="white", font=font)
            x += draw.textlength(part, font=font)
            if i < len(parts) - 1:
                draw.text((x, y_position), highlighted_word, fill="yellow", font=font)
                x += draw.textlength(highlighted_word, font=font)
    else:
        draw.text((text_x, y_position), text, fill="white", font=font)
    
    return np.array(img)

def process_video(video_path, srt_path, output_path):
    """Process video with guaranteed visible subtitles"""
    print("Loading video...")
    video = VideoFileClip(video_path)
    width, height = video.size
    
    print(f"Video dimensions: {width}x{height}")
    
    print("Parsing subtitles...")
    subtitles = parse_srt(srt_path)
    
    subtitle_clips = []
    
    print("Creating subtitle clips...")
    for sub in subtitles:
        start = sub.start.total_seconds()
        end = sub.end.total_seconds()
        
      
        words = sub.content.split()
        duration_per_word = (end - start) / len(words)
        
        for i, word in enumerate(words):
            clip_start = start + i * duration_per_word
            clip_end = clip_start + duration_per_word
            
            frame = create_subtitle_frame(
                sub.content,
                (width, height),
                highlighted_word=word
            )
            
            subtitle_clip = ImageClip(frame)\
                .set_start(clip_start)\
                .set_duration(clip_end - clip_start)\
                .set_position(("center", "bottom"))
            
            subtitle_clips.append(subtitle_clip)
    
    print("Compositing final video...")
    final = CompositeVideoClip([video] + subtitle_clips)
    
    print("Writing output...")
    final.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        fps=video.fps,
        threads=4  
    )
    
    print("Cleaning up...")
    video.close()
    final.close()
    print("Done!")

if __name__ == "__main__":
    process_video("test2.mp4", "test.srt", "output.mp4")