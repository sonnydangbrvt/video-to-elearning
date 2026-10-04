# video-to-elearning

Biến **video dài 1–4 giờ** (Zoom, workshop, livestream, screencast) thành **bộ bài giảng e-learning**:
chia phần/bài có duyệt, cắt đoạn thừa với **chuyển cảnh mượt + whoosh**, tua 2× khoảng lặng, bỏ đoạn nói nhầm,
khử ồn + chuẩn âm lượng, **mở đầu bằng thumbnail đã duyệt + nhạc**, QA, phụ đề, danh sách bài, và (tuỳ chọn) đăng YouTube/Mux + gói nạp website.

Dùng như **Claude Code skill** (Claude điều phối, bạn chỉ duyệt) hoặc gọi CLI trực tiếp. **Bắt đầu từ [HUONG-DAN.md](HUONG-DAN.md).**

> Đã chạy thật: workshop Zoom 4h02 → 26 video, 2h53, ≈1.5 GB, bàn giao trong một đêm.

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

> "Dùng skill video-to-elearning: cắt video `~/Zoom/buoi4.mp4` (kèm `buoi4.vtt`) thành bài giảng, nối tiếp Phần 14, đoạn bán hàng làm Bonus."

Claude chạy theo [SKILL.md](SKILL.md) với **5 cổng duyệt**: PLAN → (banner thử nếu brand mới) → thumbnail → video mẫu → nghiệm thu. Không cổng nào được bỏ qua.

## CLI

```bash
V=~/.claude/skills/video-to-elearning/bin/v2e.mjs
node $V doctor [--install]                               # kiểm tra / cài môi trường (hỏi trước khi cài)
node $V init ~/Zoom/v2e-buoi4 --video ~/Zoom/buoi4.mp4 --transcript ~/Zoom/buoi4.vtt --title "Buổi 4"
node $V prepare ~/Zoom/v2e-buoi4                         # tách tiếng, đo khoảng lặng/độ to, ảnh, mốc đổi cảnh
node $V clean-audio ~/Zoom/v2e-buoi4 --sample            # nghe thử → bỏ --sample để chạy thật (chạy nền)
node $V transcribe ~/Zoom/v2e-buoi4                      # cues.json, bymin.txt, flags.md
#   → Claude viết PLAN.md → BẠN DUYỆT → viết edl.json (templates/edl.example.json)
node $V edl ~/Zoom/v2e-buoi4 --snap                      # kiểm tra + dời chỗ cắt vào khoảng dừng
node $V thumbs ~/Zoom/v2e-buoi4 [--prompts]              # thumbnail (BẠN DUYỆT) — làm trước khi render
node $V render ~/Zoom/v2e-buoi4 --sample [MÃ]            # bài mẫu (BẠN DUYỆT)
node $V render ~/Zoom/v2e-buoi4 --all                    # hàng loạt (--only A1,A2 · --force · --reassemble)
node $V qa ~/Zoom/v2e-buoi4                              # kiểm tra chất lượng
node $V export ~/Zoom/v2e-buoi4                          # curriculum + phụ đề
node $V youtube|mux ~/Zoom/v2e-buoi4 …                   # (tuỳ chọn) đăng host video — luôn có cổng xác nhận
node $V deliver ~/Zoom/v2e-buoi4                         # (tuỳ chọn) gói course.json cho website e-learning
node $V status ~/Zoom/v2e-buoi4                          # đang ở bước nào, bước tiếp là gì
```

## Cấu trúc repo

```
HUONG-DAN.md             hướng dẫn cho người dùng (bắt đầu từ đây)
SKILL.md                 chỉ dẫn cho Claude: cổng duyệt, từng bước, bài học rút ra, hậu kỳ (entry của skill)
bin/v2e.mjs              CLI
lib/                     doctor, prepare, transcribe, audio, edl, frame, render, thumbs, qa, export, youtube, mux, deliver
remotion/                LessonThumbnail (thumbnail) + LessonIntro (dự phòng khi chưa có thumbnail)
assets/brand/            logo.png, thumb-bg-default.png, intro-bg.png (Coachio) — thay để đổi thương hiệu
assets/music/            intro-music.m4a — nhạc mở đầu dùng chung
assets/sfx/              cut-woosh.wav, intro-woosh.wav — hiệu ứng chuyển cảnh
assets/frame/            hình nền macOS thay viền đen (wallpaper-purple, wallpaper-dunes)
assets/thumbnail/        PROMPT-TEMPLATE.md (prompt tạo nền AI + ảnh ref), examples/, sample-thumbnail.png
templates/               brief, PLAN, edl.example.json, glossary.json (thuật ngữ Zoom nghe nhầm)
scripts/                 youtube-autoretry.sh
docs/                    QUY-TRINH.md (kỹ thuật chi tiết), THUMBNAIL.md
CHANGELOG.md · VERSION
```

Chỉ hỗ trợ macOS (Homebrew, Spotlight). Không cần Python.
