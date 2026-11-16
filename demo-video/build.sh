#!/bin/bash
# Build the TriageGenie demo video from real print-to-PDF captures of the live
# Jira site (CPG-10 issue, panel, Apply confirmation, board) + the title card.
# 1920x1080, 30fps, H.264 + silent AAC. Segments are cut together (no crossfade).
# Sources are portrait letter pages rendered at 200dpi (1700x2200); each app
# segment slowly pans vertically through the page (zoompan), like the
# FieldNotes video. English captions burned in, NO voiceover.
set -e
cd "$(dirname "$0")"

FONT=/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf
FONTB=/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf
NAVY=0x0b1f3a

# Caption style: white text on a translucent dark box, centred, near the bottom.
cap_filter() { # $1 = caption file
  echo "drawtext=fontfile=$FONT:textfile=$1:fontsize=44:fontcolor=white:box=1:boxcolor=0x00000099:boxborderw=28:x=(w-text_w)/2:y=h-text_h-60"
}

fade() { # $1 = duration
  echo "fade=t=in:st=0:d=0.5,fade=t=out:st=$(python3 -c "print($1-0.5)"):d=0.5"
}

# pan through a portrait render: $1=image $2=caption $3=duration $4=y0 $5=y1 $6=out
# source scales to 1920x2484; the 1920x1080 window pans from y0 to y1.
pan() {
  local frames=$(( $3 * 30 ))
  ffmpeg -y -v error -loop 1 -i "$1" -f lavfi -i anullsrc=r=48000:cl=stereo -t "$3" \
    -vf "scale=1920:-2,zoompan=z=1.0:x=0:y='$4+($5-$4)*on/$((frames-1))':d=$frames:s=1920x1080:fps=30,$(cap_filter "$2"),$(fade "$3")" \
    -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -shortest "$6"
}

# helper for a static full-frame image with a caption
still() { # $1=image $2=caption $3=duration $4=out
  ffmpeg -y -v error -loop 1 -i "$1" -f lavfi -i anullsrc=r=48000:cl=stereo -t "$3" \
    -vf "scale=1920:1080,$(cap_filter "$2"),$(fade "$3")" \
    -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -shortest "$4"
}

printf '%s' "Every new issue gets classified, prioritised and answered — automatically." > cap_title.txt
printf '%s' "A new issue lands. Someone has to read it, label it, and reply." > cap_board.txt
printf '%s' "TriageGenie already did it — labels, priority, first response." > cap_triage.txt
printf '%s' "Everything is explained — nothing is a black box." > cap_panel.txt
printf '%s' "One click applies it — and it never double-posts." > cap_apply.txt

# 1 — title card (6s)
still cover.png cap_title.txt 6 seg1.mp4
# 2 — board / the problem (16s): header down to the CPG-10 card
pan raw/f4-1.png cap_board.txt 16 0 1404 seg2.mp4
# 3 — auto-triage (24s): title and description down to the bot comment
pan raw/f1-1.png cap_triage.txt 24 100 1150 seg3.mp4
# 4 — panel (30s): panel heading down to the Apply button
pan raw/f2-1.png cap_panel.txt 30 700 1404 seg4.mp4
# 5 — Apply (24s): title down to the green confirmation banner
pan raw/f3-1.png cap_apply.txt 24 100 500 seg5.mp4

# 6 — end card (8s): cover + repo link
ffmpeg -y -v error -loop 1 -i cover.png -f lavfi -i anullsrc=r=48000:cl=stereo -t 8 \
  -vf "scale=1920:1080,drawtext=fontfile=$FONT:text='github.com/wei1987607/triagegenie':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=830,drawtext=fontfile=$FONT:text='Free — install on any Jira site':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=910,$(fade 8)" \
  -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -shortest seg6.mp4

printf "file 'seg1.mp4'\nfile 'seg2.mp4'\nfile 'seg3.mp4'\nfile 'seg4.mp4'\nfile 'seg5.mp4'\nfile 'seg6.mp4'\n" > concat.txt
ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy triagegenie-demo.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 triagegenie-demo.mp4
echo BUILD-DONE
