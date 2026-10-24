# CMS Media Conversion Dependencies

The optional R2-backed CMS recording workflow loads these pinned components on
demand. They are not part of the learner PWA. Other dependency licenses remain
available in their installed packages.

| Component | Version | Declared License | Upstream |
| --- | --- | --- | --- |
| `@ffmpeg/ffmpeg` | 0.12.15 | MIT | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `@ffmpeg/core` | 0.12.10 | GPL-2.0-or-later | https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core |

Core JavaScript/WASM files are seeded into private R2 and served to authenticated
owners, rather than committed to this repository or deployed as static assets.
FFmpeg and its enabled external libraries have their own license terms; review
the exact core build and corresponding source/license distribution obligations
before externally distributing hosted media conversion. This notice records the
dependencies and is not a complete source-distribution/compliance package.

Upstream source/build scripts: https://github.com/ffmpegwasm/ffmpeg.wasm

FFmpeg licensing: https://ffmpeg.org/legal.html
