# Changelog

## 1.3.0 — 2026-10-16
Rút ra từ buổi "K3 Bootcamp – Buổi 1" (3h20 → 22 bài, 2h47).
- **`v2e leak`**: quét OCR video thành phẩm tìm chữ nhạy cảm (mật khẩu, tên đăng nhập). Cắt đúng lúc dán mật khẩu là chưa đủ — cửa sổ chat hiện lại ở các đoạn khác; bước quét này là một phần của cổng nghiệm thu.
- Thumbnail: bố cục gọn dùng được khi có headline mà không có mascot (`brand.thumbMascot` tuỳ chọn); tên giảng viên dùng `brand.thumbKicker`.
- Bài học quy trình: đổi khoảng cắt thì khung thumbnail tự đổi → dựng lại thumbnail rồi mới render bài; chọn khung thumbnail theo độ sáng và chi tiết khi khung giữa bài tối/trống.
- Tài liệu: sơ đồ `docs/flow.svg`, `docs/FLOW.md`, README có sơ đồ.
- Skill `mux-publisher` nằm trong repo (`skills/mux-publisher`).

## 1.2.1 — 2026-10-05
- Bộ giới hạn đỉnh cuối (−1.5 dBFS) cho mọi bài, chống méo tiếng khi mã hoá.
- Video chèn: giữ nhạc nền gốc của clip ở đoạn không lời (`musicLufs`, mặc định −24 LUFS) thay vì tắt tiếng; QA nới ngưỡng cho bài có nhạc chèn.

## 1.2.0 — 2026-10-05
- Chèn video ngoài thay cho một đoạn gốc (`lessons[].inserts`): chuyển cảnh hai đầu, nền mờ khi khác tỉ lệ, chuẩn âm lượng lời, chữ hướng dẫn theo từng bước (`callouts[].insert/offset`), ghi vào nhật ký cắt.
- Nhạc nền dưới giọng giảng: **tắt mặc định** (chỉ nhạc ở đoạn thumbnail mở đầu).

## 1.1.0 — 2026-10-05
Rút ra từ buổi "Muse AI" (3h31 → 14 bài, 2h18).
- Thumbnail: dòng nhấn mạnh toàn bộ + mascot (`brand.thumbHeadline`, `brand.thumbMascot`); khung ảnh theo tỉ lệ thật, tự cắt viền đen khi lấy ảnh.
- Chữ chủ đề bên trái video (`lessons[].callouts`, thẻ Remotion PNG) + nhạc nền nhẹ (`assets/music/bed.m4a`).
- Luật gộp chỗ cắt gần nhau (`rules.mergeGap`).
- Thứ tự bài theo khoá học (không bắt buộc theo thứ tự bản ghi); một lần duyệt gộp thumbnail + video mẫu.

## 1.0.0 — 2026-10-05
Bản đóng gói đầu tiên, rút ra từ 6 buổi thực tế (cuối cùng: Vibe Code 3D, 4h02 → 26 video 2h53).

- Quy trình đủ vòng: doctor → init → prepare → clean-audio → transcribe → PLAN → edl → thumbs → render → qa → export → (youtube/mux) → deliver, với 5 cổng duyệt.
- Cắt theo khoảng lặng đo từ âm thanh; chỗ cắt dời vào khoảng dừng; tua 2× / cắt khoảng chết.
- Chuyển cảnh ở mọi chỗ cắt (giảm tiếng, mờ hình, whoosh) + nhật ký `cut-log.md/.csv` (số video, thời điểm, lý do).
- Bố cục A+C: tự cắt viền đen của bản ghi; 16:9 lấp đầy, 4:3 trên nền macOS.
- Mở đầu mỗi video = thumbnail đã duyệt + nhạc + whoosh; nối `-c copy`; `--reassemble` đổi nhanh.
- Thumbnail HTML/Remotion (ảnh chụp thật trong khung nghiêng, hoặc nền AI theo prompt chuẩn), cổng duyệt brand mới.
- Khử ồn + chuẩn −16 LUFS; QA tự động (thời lượng, âm lượng, A/V, đen vùng giữa).
- Hậu kỳ: YouTube, Mux, `deliver` → `course.json` cho website e-learning.
- Đóng gói: SFX/nhạc/hình nền đi kèm `assets/`; hướng dẫn người dùng `HUONG-DAN.md`.
