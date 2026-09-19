# Media fixture seeds

`npm run fixtures:media` copies the encoded video seed and expands the synthetic MP3 seed into the browser fixtures. FFmpeg is not required for that command.

`test-video.mp4` is a solid-black 64×64 video, four seconds at 24 fps, encoded as H.264 Constrained Baseline/yuv420p with no audio. It has 96 frames and an MP4 faststart header. The previous hand-patched, one-frame file reached EOF immediately in Firefox; a normal encoded stream is required to test playback and seeking.

The seed was generated with FFmpeg 7.1 and libx264, using only synthetic color input:

```sh
ffmpeg -f lavfi -i color=c=black:s=64x64:r=24:d=4 -frames:v 96 -an -c:v libx264 -profile:v baseline -level:v 3.0 -pix_fmt yuv420p -r 24 -g 24 -keyint_min 24 -sc_threshold 0 -threads 1 -movflags +faststart test-video.mp4
```

Seed SHA256: `d4e61e71cbcdcacf9f7f9f262743271f1522bcf5b351afb1073c75fbcd67da37`.
