import yt_dlp
import sys
import os

def download_video(url):
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': 'downloads/%(id)s.%(ext)s',
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("ERROR: Missing YouTube URL")
        sys.exit(1)
        
    try:
        path = download_video(sys.argv[1])
        print(f"VIDEO_PATH:{path}")
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)