---
name: video-to-elearning
description: Biến video dài 1–4 giờ (Zoom/workshop/livestream/screencast) thành bộ bài giảng e-learning — transcript, lập PLAN chia phần/bài để duyệt, cắt đoạn thừa, tua 2x khoảng lặng, bỏ đoạn nói nhầm, khử ồn + chuẩn âm lượng, intro Remotion, thumbnail theo brand (kèm prompt tạo ảnh nền + ảnh tham chiếu), QA và xuất curriculum + phụ đề. Dùng khi người dùng gửi video/folder video dài và muốn "cắt thành bài giảng", "làm khoá học", "chia chương", "e-learning", "cắt video buổi học/bootcamp/workshop", "làm thumbnail bài học", "bỏ đoạn thừa/tiếng ồn", kể cả khi không nhắc tên skill.
---

# video-to-elearning

CLI: `node ~/.claude/skills/video-to-elearning/bin/v2e.mjs <lệnh>` (bên dưới viết tắt `v2e`).
Quy trình đầy đủ + lý do từng luật: [docs/QUY-TRINH.md](docs/QUY-TRINH.md). Thumbnail: [docs/THUMBNAIL.md](docs/THUMBNAIL.md).

## 0. Lần đầu dùng (hoặc `state/setup.json` chưa `ready: true`): kiểm tra môi trường

1. Chạy `v2e doctor`, rồi đưa bảng kết quả cho người dùng xem.
2. Nếu có mục ❌: liệt kê **sẽ cài/tải gì, dung lượng bao nhiêu, lấy từ đâu** (có trong output). Mục `[LIÊN KẾT]` là dùng lại file đã có, không tải.
3. **Hỏi người dùng xác nhận.** Chỉ khi họ đồng ý rõ ràng mới chạy `v2e doctor --install --yes` (hoặc `--only id1,id2` nếu họ chỉ đồng ý một phần). Không bao giờ tự cài khi chưa được đồng ý.
4. Mục `[TỰ LÀM]` (Homebrew, Node) cần mật khẩu máy → hướng dẫn người dùng tự chạy, không làm thay.

## 1. Tiếp nhận

- Hỏi những gì còn thiếu (một lần, gộp chung): đường dẫn video, transcript (VTT Zoom là tốt nhất), buổi số mấy / nối tiếp phần nào, xử lý đoạn bán hàng, độ dài bài. Để trống thì dùng mặc định trong `templates/brief.template.md`.
- Thư mục dự án mặc định: cạnh video, tên `v2e-<tên-buổi>`.
- `v2e init <dir> --video <f> [--transcript <f>] [--zoom-json <f>] --title "…"` → điền `brief.md` từ câu trả lời.
- Thêm thuật ngữ riêng của buổi vào `work/glossary.json` (`prompt` + `replace`).

## 2. Phân tích (tự động)

- `v2e prepare <dir>` → media, audio 16k, độ to, **khoảng lặng đo từ âm thanh** (nguồn sự thật để cắt/tua), frame + contact sheet, mốc đổi cảnh.
- Chạy nền `v2e clean-audio <dir> --sample` → gửi 3 cặp file trước/sau cho người dùng nghe → chọn preset → chạy nền `v2e clean-audio <dir> [--preset …]` trong lúc viết PLAN.
- `v2e transcribe <dir>` → `work/cues.json`, `work/bymin.txt`, `work/flags.md` (ảo giác, nói nhầm, chờ lớp, bán hàng, khoảng chết).

## 3. PLAN.md → DUYỆT 1 (bắt buộc)

Đọc `work/bymin.txt` (toàn bộ), `work/flags.md`, `work/frames/contact-sheet-*.jpg`, `work/scenes.json`, `brief.md`. Viết `PLAN.md` **đúng mẫu** `templates/PLAN.template.md`:
- Chia phần/bài, mỗi bài 5–12' (>15' đề xuất điểm tách, <3' gộp). Tên bài = động từ + kết quả. Mỗi bài 2–3 ý nội dung.
- Ranh giới đặt ở chỗ chuyển ý ("tiếp theo", "rồi bây giờ"…), trùng mốc đổi cảnh nếu có.
- Liệt kê đoạn cắt bỏ và bảng **đoạn cần duyệt riêng** (M1, M2…) kèm đề xuất cắt/giữ. Lỗi demo dạy được cách debug thì đề xuất GIỮ.
- Mốc thời gian lấy từ cues (Zoom VTT chính xác; Whisper chỉ chính xác ±1–2s, bước snap sẽ sửa).
Gửi PLAN cho người dùng và **dừng lại chờ duyệt**. Không render gì trước khi được duyệt.

## 4. edl.json

Chuyển PLAN đã duyệt thành `edl.json` theo `templates/edl.example.json`, gồm `lessons[]` (code, part, title, start, end, drops, noSpeedup, mute, bullets, thumbTitle/thumbVisual…), `mistakes[]` (drop true/false theo quyết định của người dùng), `parts`, `brand`.
Chạy `v2e edl <dir> --snap` rồi `v2e edl <dir>` cho đến khi `✔ edl.json hợp lệ`. Nếu báo "không có chỗ ngắt hơi" → dời mốc sang chỗ chuyển câu khác hoặc `--window 15`.

## 5. Bài mẫu → DUYỆT 2

`v2e render <dir> --sample` (tự chọn bài có nhiều khoảng lặng nhất) → gửi file trong `out/sample/` cho người dùng xem nhịp 2x, âm thanh, điểm cắt, intro. Sửa `rules`/edl nếu cần rồi render mẫu lại.

## 6. Render hàng loạt

`v2e render <dir> --all`. Chạy lâu → chạy nền. Bị ngắt thì chạy lại, bài đã xong sẽ tự bỏ qua. Lệnh này cũng xuất `out/review-mistakes/` (hậu tố `-BO` là đang bỏ, `-GIU` là đang giữ).

## 7. Thumbnail

1. Gửi người dùng xem `assets/thumbnail/sample-thumbnail.png` + `assets/thumbnail/examples/*.png`, rồi hỏi họ chọn:
   - **A. Nhanh:** nền mặc định của brand + chữ từng bài → chạy `v2e thumbs <dir>`.
   - **B. Nền riêng mỗi bài:** viết `thumbVisual`/`thumbSecondary`/`thumbBadge` (tiếng Anh, mô tả một màn hình có kết quả) + `thumbTitle` (≤6 từ, 1 từ khoá bọc `**…**`) cho từng bài trong edl → chạy `v2e thumbs <dir> --prompts` → gửi `out/thumb-prompts.md` + danh sách ảnh tham chiếu cần đính kèm (style ref, logo công cụ, `out/thumb-refs/<MÃ>.jpg`). Người dùng tạo ảnh (hoặc Claude tạo bằng công cụ tạo ảnh nếu phiên có) → lưu `brand/thumb-bg/<MÃ>.png` → chạy `v2e thumbs <dir>`.
2. Xem lại từng ảnh trong `out/thumb/`: chữ không đè mockup, đọc được ở cỡ nhỏ.

## 8. QA + bàn giao → DUYỆT 3

`v2e qa <dir>` → sửa bài ❌. Chạy `v2e export <dir>` → `out/curriculum.json/.csv`, `out/captions/*.srt`. Báo cáo: số bài, thời lượng gốc → sau cắt, file lỗi cần xem, đường dẫn các thư mục kết quả.

## Luật cứng

- Không sửa/xoá file trong `input/` hoặc video gốc.
- Không cắt trước DUYỆT 1; không render hàng loạt trước DUYỆT 2.
- Quyết định tua/cắt dựa vào khoảng lặng đo từ âm thanh, không dựa vào mốc Whisper.
- Chữ tiếng Việt trên thumbnail/intro luôn do Remotion đặt; ảnh AI không được chứa chữ tiêu đề.
- `v2e status <dir>` cho biết dự án đang ở bước nào; dùng khi tiếp tục công việc ở phiên mới.
