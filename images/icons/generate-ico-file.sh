#!/bin/bash
file_path="$(realpath "$1")"
echo "File to convert: ${file_path}"

ico_path="${file_path%.*}.ico"
echo "File to produce: ${ico_path}"

ffmpeg -i "${file_path}" -filter_complex \
    "[0:v]scale=256:256:flags=neighbor[v256]; \
     [0:v]scale=128:128:flags=neighbor[v128]; \
     [0:v]scale=64:64:flags=neighbor[v64];   \
     [0:v]scale=32:32:flags=neighbor[v32];   \
     [0:v]scale=16:16:flags=neighbor[v16]"   \
    -map "[v256]" -map "[v128]" -map "[v64]" -map "[v32]" -map "[v16]" "${ico_path}"

