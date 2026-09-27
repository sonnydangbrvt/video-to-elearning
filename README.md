# video-to-elearning

Biến **video dài 1–4 giờ** (Zoom, workshop, livestream, screencast) thành **bộ bài giảng e-learning**:
chia phần/bài có duyệt, cắt đoạn thừa, tua 2x khoảng lặng, bỏ đoạn nói nhầm, khử ồn + chuẩn âm lượng,
intro Remotion, thumbnail theo brand, QA, curriculum + phụ đề.

Dùng như **Claude Code skill** (Claude điều phối và viết PLAN) hoặc gọi CLI trực tiếp.

![thumbnail mẫu](assets/thumbnail/sample-thumbnail.png)

## Cài đặt

```bash
git clone <repo> ~/video-to-elearning
~/video-to-elearning/install.sh
```

`install.sh` liên kết skill vào `~/.claude/skills/video-to-elearning`, rồi chạy `doctor`:

| Thành phần | Cách cài | Dung lượng |
|---|---|---|
| Node.js ≥ 18 | tự cài (nodejs.org / brew) | — |
| FFmpeg (afftdn, loudnorm, xfade…) | `brew install ffmpeg` | ~100 MB |
| whisper.cpp (có `--vad`) | `brew install whisper-cpp` | ~20 MB |
| Model Whisper large-v3-turbo | tải HuggingFace, hoặc **dùng lại file đã có trên máy** | 1.6 GB |
| Model VAD Silero v5.1.2 | tải HuggingFace | 0.9 MB |
| Remotion + Chrome headless | `npm install` + `remotion browser ensure` | ~340 MB |

`doctor` liệt kê những gì còn thiếu và **hỏi [y/N] trước khi cài/tải**. Model tải về lưu ở `~/.cache/video-to-elearning/models/`.

## Dùng với Claude Code

> "Cắt video `~/Zoom/buoi4.mp4` (kèm `buoi4.vtt`) thành bài giảng, nối tiếp Phần 14, đoạn bán hàng làm Bonus."

Claude chạy theo [SKILL.md](SKILL.md): kiểm tra môi trường → phân tích → **PLAN.md chờ duyệt** → bài mẫu **chờ duyệt** → render toàn bộ → thumbnail → QA → bàn giao.

## CLI

```bash
V=~/.claude/skills/video-to-elearning/bin/v2e.mjs
node $V doctor [--install]
node $V init ~/Zoom/v2e-buoi4 --video ~/Zoom/buoi4.mp4 --transcript ~/Zoom/buoi4.vtt --title "Buổi 4"
node $V prepare ~/Zoom/v2e-buoi4
node $V clean-audio ~/Zoom/v2e-buoi4 --sample     # nghe thử → bỏ --sample để chạy thật
node $V transcribe ~/Zoom/v2e-buoi4
#   → viết PLAN.md (templates/PLAN.template.md) → duyệt → viết edl.json (templates/edl.example.json)
node $V edl ~/Zoom/v2e-buoi4 --snap
node $V render ~/Zoom/v2e-buoi4 --sample          # duyệt bài mẫu
node $V render ~/Zoom/v2e-buoi4 --all
node $V thumbs ~/Zoom/v2e-buoi4 [--prompts]
node $V qa ~/Zoom/v2e-buoi4
node $V export ~/Zoom/v2e-buoi4
node $V status ~/Zoom/v2e-buoi4                   # đang ở bước nào
```

## Cấu trúc repo

```
SKILL.md                 hướng dẫn cho Claude (entry của skill)
bin/v2e.mjs              CLI
lib/                     doctor, prepare, transcribe, audio, edl, render, remotion, thumbs, qa, export
remotion/                composition LessonIntro (video 4s) + LessonThumbnail (ảnh 16:9)
assets/brand/            intro-bg.png, thumb-bg-default.png, logo.png (Coachio) — thay để đổi brand
assets/thumbnail/        PROMPT-TEMPLATE.md (prompt tạo nền + ảnh ref), examples/, sample-thumbnail.png
templates/               brief, PLAN, edl.example.json, glossary.json (thuật ngữ nghe nhầm)
docs/                    QUY-TRINH.md (quy trình chi tiết), THUMBNAIL.md
```

Chỉ hỗ trợ macOS (Homebrew, Spotlight). Không cần Python.
