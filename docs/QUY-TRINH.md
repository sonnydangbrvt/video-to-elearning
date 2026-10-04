# Quy trình: Video dài (1–4h) → Bộ bài giảng E-learning

Tổng hợp từ 6 lần làm thực tế: Buổi 1, Bunny+Supabase, Buổi 2, Buổi 3 (Bootcamp Vibe Code), Workshop 13/08 và Workshop "Vibe Code 3D" 26/09 (26 bài, 2h53 từ 4h02).
Mỗi bước có lệnh `v2e` tương ứng. Có 5 cổng duyệt; không bước nào tốn thời gian được chạy trước khi duyệt.
(Hướng dẫn ngắn cho người dùng: [../HUONG-DAN.md](../HUONG-DAN.md).)

```
doctor ══CỔNG 0══ → init → prepare → clean-audio (chạy nền) → transcribe
     → PLAN.md ══DUYỆT 1══ → edl.json (+snap)
     → [brand mới: 1 banner thử ══DUYỆT 2══] → thumbs ══DUYỆT 3══
     → render --sample ══DUYỆT 4══ → render --all
     → qa → export ══DUYỆT 5══
     → (khi cần) youtube / mux → deliver
```

## Cấu trúc một dự án

```
v2e-buoi4/
├── input/            source.mp4 (symlink tới video gốc), transcript.vtt, zoom.json — KHÔNG sửa
├── brief.md          yêu cầu của người dùng
├── PLAN.md           kế hoạch cắt cho người đọc (DUYỆT 1)
├── edl.json          nguồn sự thật để render (máy đọc)
├── brand/            intro-bg.png, logo.png, thumb-bg-default.png, thumb-bg/<MÃ>.png
├── work/             media.json, audio16k.wav, loudness.json, silences(.clean).json,
│                     cues.json, cues.timed.txt, bymin.txt, flags.md, frames/, scenes.json,
│                     audio-clean.m4a, glossary.json
└── out/              sample/, final/, thumb/, captions/, review-mistakes/,
                      qa-report.md, curriculum.json/.csv, thumb-prompts.md, thumb-refs/
```

## Bước 1 — Tiếp nhận: `v2e init`

Hỏi 1 lần, gộp chung (xem `templates/brief.template.md`): tên khoá, buổi số / nối tiếp phần nào, đối tượng, độ dài bài,
xử lý đầu/cuối buổi, đoạn bán hàng (mặc định: cắt, hoặc thành bài **Bonus** đặt cuối), lỗi demo (fumble thì cắt, lỗi dạy debug thì giữ),
đoạn không được tua, thuật ngữ riêng, brand, phương án thumbnail.

## Bước 2 — Phân tích: `v2e prepare`

| Đầu ra | Dùng để |
|---|---|
| `media.json` | độ phân giải, fps (Zoom 1832×982 / 1920×1080 / Retina 3024×1964; 25/30/60fps) |
| `loudness.json` | độ to gốc, nền ồn → chọn preset lọc |
| `silences.json` | **mọi khoảng lặng ≥0.3s**, ngưỡng tự tính theo giọng. Đây là nguồn sự thật để tua/cắt và snap |
| `frames/contact-sheet-*.jpg` + `index.json` | nhìn toàn video theo thời gian (6×5 ảnh/tấm) |
| `scenes.json` | mốc đổi màn hình (slide ↔ demo ↔ camera), chỉ giải mã keyframe nên nhanh |

## Bước 3 — Âm thanh: `v2e clean-audio` (chạy nền ngay sau prepare)

`--sample` xuất 3 cặp 30s trước/sau để nghe. Các preset:

| Preset | Chuỗi lọc | Khi nào |
|---|---|---|
| light | highpass 70 · afftdn nhẹ | phòng yên tĩnh, mic tốt |
| **standard** | highpass 80 · lowpass 12k · afftdn nr12 · deesser · compressor | mặc định (Zoom, laptop) |
| strong | + afftdn nr20 · noise gate · nén mạnh | quạt/máy lạnh to, mic xa |

Sau đó chuẩn hoá loudnorm 2 lượt về **−16 LUFS, đỉnh −1.5 dBTP**. Bộ lọc nặng chỉ chạy 1 lần ra FLAC tạm.
Kết quả `work/audio-clean.m4a` cùng timeline với video, render tự dùng file này. Sau đó dò lại khoảng lặng trên audio sạch (`silences.clean.json`), chính xác hơn khi nguồn ồn.
Tiếng ồn đột ngột (chuông điện thoại, mic học viên) → khai báo `mute` trong bài.

## Bước 4 — Transcript: `v2e transcribe`

- Có **VTT Zoom** → dùng luôn (có tên người nói, mốc chính xác). SRT hoặc whisper JSON cũng nhận.
- Không có → whisper.cpp large-v3-turbo, **bật VAD** (chặn "ảo giác" kiểu *"subscribe lalaschool"* trên đoạn im lặng), có `--prompt` là danh sách thuật ngữ, chia chunk 28' và chạy lại được từng chunk.
- ⚠️ Mốc thời gian của whisper.cpp chỉ đúng ±1–2s. Vì vậy **không dùng mốc Whisper để quyết định cắt**, chỉ dùng để hiểu nội dung và làm phụ đề.
- Sửa thuật ngữ nghe nhầm bằng `glossary.json` (thay nguyên từ: "Claw"→"Claude" nhưng "OpenClaw" giữ nguyên).
- `flags.md` tự gắn cờ: ảo giác, nói nhầm/xin lỗi/làm lại, chờ/tương tác lớp, bán hàng/khảo sát, khoảng chết ≥25s.

## Bước 5 — PLAN.md ══ DUYỆT 1 ══

Claude đọc `bymin.txt` + `flags.md` + contact sheet, rồi viết theo `templates/PLAN.template.md` (mẫu Buổi 3 đã được duyệt):
tổng quan · bảng bài theo phần (mã, timestamp, cue, thời lượng, tên + 2–3 ý) · đoạn cắt bỏ · **đoạn cần duyệt riêng (M1…)** kèm đề xuất · âm thanh · gợi ý thumbnail · phụ lục thuật ngữ.

**Luật chia bài:** 5–12'/bài (>15' tách, <3' gộp) · cắt ở chỗ chuyển ý hoặc đổi màn hình · tên bài = động từ + kết quả, ≤60 ký tự ·
giữ trình tự tuyến tính (trừ Bonus) · bài liền nhau dùng chung ranh giới.

## Bước 6 — `edl.json` + `v2e edl --snap`

Viết theo `templates/edl.example.json`. `--snap` dời ranh giới bài vào **giữa chỗ ngắt hơi gần nhất** (dự phòng là khe giữa 2 câu), 2 bài liền nhau snap về cùng một điểm.
`v2e edl` in bảng thời lượng gốc → sau cắt và báo lỗi: trùng mã, chồng lấn, vượt độ dài, ranh giới rơi giữa lúc đang nói.

**Luật tua/cắt** (`rules`, kế thừa Buổi 3):

| Khoảng không lời | Xử lý |
|---|---|
| < 2.5s | giữ 1x (nhịp nói tự nhiên) |
| 2.5s – 25s | tua 2x (`setpts=PTS/2`, `atempo=2`) |
| ≥ 25s | cắt, giữ 1s đầu + 1s cuối |
| nằm trong `noSpeedup` | giữ 1x (thao tác cần xem kỹ) |
| có lời | luôn 1x; chừa 0.15s trước và 0.25s sau để không cụt chữ |

`drops` (trong bài) + `mistakes[drop=true]` + `drops` toàn cục đều bị bỏ hẳn.

## Bước 7 — Thumbnail: `v2e thumbs` (làm TRƯỚC khi render video)

Xem [THUMBNAIL.md](THUMBNAIL.md). Thumbnail đã duyệt chính là **đoạn mở đầu** của từng video, nên phải xong trước khi render.
Brand mới → hỏi logo + 3 màu + kicker → 1 banner thử → duyệt (tạo file `brand/APPROVED`) → mới làm cả bộ.

## Bước 8 — Bài mẫu rồi mới hàng loạt: `v2e render --sample` ══ DUYỆT 4 ══ → `--all`

Mỗi bài:
- **Hình** từ video gốc, **tiếng** từ `audio-clean.m4a`; tự dò & cắt viền đen có sẵn của bản ghi (`detectCrop`).
- **Bố cục A+C:** nội dung ≈16:9 lấp đầy 1920×1080; tỉ lệ khác (4:3…) đặt giữa trên hình nền macOS thay cho viền đen. Không làm khung cửa sổ/mockup (chậm, chữ nhỏ).
- **Chuyển cảnh ở mọi chỗ cắt:** tiếng cảnh trước giảm dần (~0.8s) → hình mờ chuyển (`edl.transition`) → whoosh (`assets/sfx/cut-woosh.wav`) → cảnh sau vào. Chỗ cắt luôn bắt đầu SỚM hơn một chút và kết thúc MUỘN hơn một chút, vào khoảng dừng.
- **Mở đầu = thumbnail đã duyệt** (4s, mờ vào/ra, nhạc `assets/music/intro-music.m4a` + whoosh), nối với phần bài bằng `-c copy` (không mã hoá lại).
- Mã hoá H.264 `crf 23`, preset `medium`, AAC 128k, faststart → ≈2 phút cho bài 8 phút, ≈1 GB cho bộ 2h53.
- Ghi **nhật ký chuyển cảnh** `out/cut-log.md/.csv`: số thứ tự video, thời điểm trong video, đoạn gốc đã bỏ, lý do — để người duyệt chỉ đúng chỗ ("video 12, chỗ cắt 07:23").
- `out/segmaps/` lưu bảng ánh xạ thời gian (dùng cho phụ đề). `out/review-mistakes/` chứa clip ±2s của từng đoạn lỗi (`-BO` đang cắt, `-GIU` đang giữ).
- Chỉ đổi thumbnail/nhạc mở đầu: `v2e render --only X --force --reassemble` (dùng lại phần bài, dưới 1 giây/bài).

## Bước 9 — `v2e qa` + `v2e export` ══ DUYỆT 5 ══

QA tự động: thời lượng khớp EDL ±2s · −16±1.5 LUFS · đỉnh ≤ −0.5 dBFS · lệch A/V < 0.15s · khung đen ở vùng giữa ≥3s · đứng hình ≥60s (chỉ cảnh báo, slide có lời giảng là bình thường) · lỗi giải mã.
Người duyệt xem thêm: 10s đầu mỗi bài (phải là thumbnail), 3 điểm cắt ngẫu nhiên, `cut-log.md`, toàn bộ `review-mistakes/`.
Export: `curriculum.json/.csv` + `captions/*.srt` đã tính lại thời gian theo video sau cắt (kể cả đoạn chồng lên nhau lúc chuyển cảnh).

## Bước 10 — Hậu kỳ (chỉ khi người dùng yêu cầu)

`v2e youtube` / `v2e mux` đăng lên host video (luôn có cổng xác nhận trước MỖI đợt: quyền riêng tư, chủ sở hữu, khoá, danh sách video) → `v2e deliver` gom thành `out/delivery/course.json` + `course.md` + `lessons.csv` cho website e-learning.
Chi tiết, giới hạn thực tế của YouTube/Mux: xem [SKILL.md](../SKILL.md) mục 10–11.

## Sửa sau khi bàn giao

| Muốn | Làm |
|---|---|
| Giữ lại một đoạn đã cắt / đổi chỗ cắt | đổi `mistakes[].drop` hoặc `drops` trong `edl.json` → `v2e edl --snap` → `v2e render --only X --force` |
| Đổi tên bài / thumbnail | sửa `title`/`thumbTitle`/`thumbFrameAt` → `v2e thumbs --only X --force` → `render --only X --force --reassemble` |
| Đổi điểm bắt đầu/kết thúc bài | sửa `start`/`end` → `edl --snap` → `render --only X --force` |
| Đổi nhạc mở đầu | `edl.introMusic` → `render --all --force --reassemble` |
| Sau khi sửa | chạy lại `qa` và `export` (cập nhật phụ đề + nhật ký cắt); bài đã đăng lên host phải đăng lại |

## Bài học từ các lần trước

| Vấn đề cũ | Cách bộ công cụ xử lý |
|---|---|
| Mỗi buổi viết lại `edl.mjs`/`cut.sh` với đường dẫn cứng, script cũ hỏng khi đổi folder | 1 CLI dùng chung + `edl.json` |
| ~19' Whisper ảo giác ("subscribe lalaschool") ở Buổi 1 | VAD + tự gắn cờ ảo giác + tua/cắt theo âm thanh thật |
| Mốc làm tròn đến giây, có chỗ cụt chữ | mili-giây + snap vào chỗ ngắt hơi + chừa 0.15/0.25s |
| Không khử ồn, âm lượng giữa các bài chênh nhau | clean-audio + loudnorm −16 LUFS + QA đo lại |
| Thumbnail = frame chụp từ intro | composition thumbnail riêng (ảnh chụp thật hoặc nền AI) |
| Không có file bàn giao | curriculum.json/.csv + phụ đề từng bài + course.json cho website |
| Chỗ cắt nghe/nhìn đột ngột, khó hiểu | chuyển cảnh mờ + giảm tiếng + whoosh + cắt vào khoảng dừng |
| Khó chỉ cho AI đúng chỗ cần sửa | nhật ký `cut-log.md` (số video + thời điểm + lý do) |
| Video mở đầu bằng intro cũ, không phải thumbnail đã duyệt | mở đầu = đúng thumbnail của bài, thumbnail làm trước khi render |
| Màn hình đen kéo dài đầu bài (người nói chưa chia sẻ màn hình) | dò độ sáng vùng giữa, dời điểm bắt đầu bài |
| Viền đen quanh video | tự dò & cắt viền, 4:3 đặt trên nền macOS |
| Phiên bản/SFX không đi theo repo → mất whoosh khi sang máy khác | SFX + nhạc + hình nền nằm trong `assets/` |
