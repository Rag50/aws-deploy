import cv2
import numpy as np
import random
import subprocess
import re
from datetime import datetime, timedelta

def parse_time(time_str):
    """Convert SRT timestamp to seconds"""
    hours, minutes, seconds = time_str.split(':')
    seconds, milliseconds = seconds.split(',')
    total_seconds = (int(hours) * 3600 + 
                    int(minutes) * 60 + 
                    int(seconds) + 
                    int(milliseconds) / 1000)
    return total_seconds

def parse_srt(srt_file):
    """Parse SRT file and return list of subtitle entries"""
    with open(srt_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    blocks = content.strip().split('\n\n')
    subtitles = []
    
    for block in blocks:
        lines = block.split('\n')
        if len(lines) >= 3:
            time_line = lines[1]
            start_time, end_time = time_line.split(' --> ')
            text = ' '.join(lines[2:])
            
            subtitles.append({
                'start': parse_time(start_time),
                'end': parse_time(end_time),
                'text': text
            })
    
    return subtitles

def create_border_mask(frame, border_ratio=0.8):
    """Create a mask for the bordered area"""
    height, width = frame.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    
   
    border_width = int(width * border_ratio)
    border_height = int(height * border_ratio)
    
  
    start_x = (width - border_width) // 2
    start_y = (height - border_height) // 2
    
   
    mask[start_y:start_y+border_height, start_x:start_x+border_width] = 255
    
    return mask, (start_x, start_y, border_width, border_height)

def find_text_space(frame, faces, text_width, text_height, border_area, iteration=0):
    """Find a position for text within the bordered area that doesn't overlap with faces"""
    start_x, start_y, border_width, border_height = border_area
    margin = 40
    
   
    valid_positions = []
    for y in range(start_y + margin, start_y + border_height - text_height - margin, 50):
        for x in range(start_x + margin, start_x + border_width - text_width - margin, 50):
            overlaps = False
            for (fx, fy, fw, fh) in faces:
                if (x < fx + fw + margin and x + text_width + margin > fx and
                    y < fy + fh + margin and y + text_height + margin > fy):
                    overlaps = True
                    break
            if not overlaps:
                valid_positions.append((x, y))
    
    if valid_positions:
        return random.choice(valid_positions)
    
   
    predefined_positions = [
        (start_x + margin, start_y + margin),  # Top left
        (start_x + (border_width - text_width) // 2, start_y + margin),  # Top center
        (start_x + border_width - text_width - margin, start_y + margin),  # Top right
        (start_x + margin, start_y + border_height - text_height - margin),  # Bottom left
        (start_x + border_width - text_width - margin, start_y + border_height - text_height - margin)  # Bottom right
    ]
    
    for pos in predefined_positions:
        overlaps = False
        for (fx, fy, fw, fh) in faces:
            if (pos[0] < fx + fw + margin and pos[0] + text_width + margin > fx and
                pos[1] < fy + fh + margin and pos[1] + text_height + margin > fy):
                overlaps = True
                break
        if not overlaps:
            return pos
    
    return (start_x + (border_width - text_width) // 2, start_y + margin)

class SubtitleAnimation:
    def __init__(self, subtitle, position, duration=1):
        self.text = subtitle['text']
        self.start = subtitle['start']
        self.end = subtitle['end']
        self.position = position
        self.fade_duration = duration
    
    def get_progress(self, current_time):
        if current_time < self.start:
            return 0
        elif current_time > self.end:
            return 0
        elif current_time - self.start < self.fade_duration:
            return (current_time - self.start) / self.fade_duration
        elif self.end - current_time < self.fade_duration:
            return (self.end - current_time) / self.fade_duration
        else:
            return 1.0

def add_animated_text(frame, position, text, progress):
    """Add animated text with smooth fade-in and scale effect"""
    font = cv2.FONT_HERSHEY_DUPLEX
    base_font_scale = 1.5
    thickness = 3
    
    current_scale = base_font_scale * (0.8 + 0.2 * progress)
    alpha = progress
    
    overlay = frame.copy()
    
    shadow_offset = 2
    cv2.putText(overlay, text, 
                (position[0] + shadow_offset, position[1] + shadow_offset),
                font, current_scale, (0, 0, 0), thickness + 2)
    
    cv2.putText(overlay, text, position, font, current_scale,
                (255, 255, 255), thickness)
    
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)



def process_video(input_video, srt_file, output_video, border_ratio=0.8):
    """Process video with animated subtitles within a bordered area while preserving audio"""
    subtitles = parse_srt(srt_file)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    cap = cv2.VideoCapture(input_video)
    
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    
    temp_video = "temp_video.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video, fourcc, fps, (frame_width, frame_height))
    
    # Create the border mask once
    border_mask, border_area = create_border_mask(np.zeros((frame_height, frame_width, 3), dtype=np.uint8), border_ratio)
    
    active_animations = []
    current_subtitle_idx = 0
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        current_time = frame_count / fps
        
        # Create a black background
        black_background = np.zeros_like(frame)
        
        # Apply the border mask
        frame_in_border = cv2.bitwise_and(frame, frame, mask=border_mask)
        frame_outside_border = cv2.bitwise_and(black_background, black_background, mask=~border_mask)
        frame = cv2.add(frame_in_border, frame_outside_border)
        
        # Detect faces
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        while (current_subtitle_idx < len(subtitles) and 
               subtitles[current_subtitle_idx]['start'] <= current_time):
            subtitle = subtitles[current_subtitle_idx]
            
            font = cv2.FONT_HERSHEY_DUPLEX
            text = subtitle['text']
            (text_width, text_height), _ = cv2.getTextSize(text, font, 1.5, 3)
            
            position = find_text_space(frame, faces, text_width, text_height, border_area)
            animation = SubtitleAnimation(subtitle, position)
            active_animations.append(animation)
            current_subtitle_idx += 1
        
        remaining_animations = []
        for anim in active_animations:
            progress = anim.get_progress(current_time)
            if progress > 0:
                remaining_animations.append(anim)
                add_animated_text(frame, anim.position, anim.text, progress)
        
        active_animations = remaining_animations
        
        out.write(frame)
        frame_count += 1
        
        if frame_count % fps == 0:
            print(f"Processed {frame_count/fps:.1f} seconds")
    
    cap.release()
    out.release()
    cv2.destroyAllWindows()
    
    print("Processing final video with FFmpeg (preserving audio)...")
    
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', temp_video,
        '-i', input_video,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        output_video
    ]
    
    subprocess.run(ffmpeg_cmd)
    
    import os
    os.remove(temp_video)
    
    print("Video processing complete with audio preserved!")

if __name__ == "__main__":
    input_video = "test.mp4"
    srt_file = "test.srt"
    output_video = "output.mp4"
    
    # You can adjust the border_ratio parameter (0.0 to 1.0) to change the size of the bordered area
    process_video(input_video, srt_file, output_video, border_ratio=0.8)