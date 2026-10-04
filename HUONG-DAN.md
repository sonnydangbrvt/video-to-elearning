# Hướng dẫn dùng — biến video dài thành bài giảng e-learning

Dành cho bạn (người dùng), **không cần biết lập trình**. Bạn chỉ cần nói chuyện với Claude và **duyệt ở 5 điểm dừng**; phần nặng máy tự chạy.

> Ví dụ thực tế: workshop Zoom 4 giờ 02 phút → **26 video (24 bài + 2 bonus), tổng 2 giờ 53 phút**, mỗi video có thumbnail, phụ đề, nhạc mở đầu; cả bộ ≈ 1.5 GB.

---

## 1. Bạn nhận được gì

| Đầu ra | Ở đâu | Dùng để |
|---|---|---|
| Các video bài giảng (mở đầu bằng thumbnail, có nhạc) | `out/final/` | đăng lên khoá học |
| Thumbnail từng bài (1920×1080) | `out/thumb/` | ảnh đại diện bài |
| Phụ đề từng bài (`.srt`) | `out/captions/` | phụ đề trên video |
| Danh sách bài (tên, mô tả, thời lượng, file) | `out/curriculum.csv` / `.json` | nhập vào nền tảng khoá học |
| **Nhật ký chỗ cắt** (video số mấy, phút nào, bỏ gì, vì sao) | `out/cut-log.md` | chỉ cho Claude chỗ cần sửa |
| Clip các đoạn nói nhầm/lỗi để xem lại | `out/review-mistakes/` | quyết định cắt hay giữ |
| Báo cáo kiểm tra chất lượng | `out/qa-report.md` | biết bài nào có vấn đề |
| *(tuỳ chọn)* link YouTube/Mux + gói cho website | `out/youtube/`, `out/mux/`, `out/delivery/course.json` | đăng và nạp lên website e-learning |

## 2. Chuẩn bị (5 phút)

- **Video gốc** (bản ghi Zoom `.mp4`).
- **File phụ đề Zoom `.vtt`** nếu có (rất nên có: có tên người nói, mốc thời gian chính xác). Không có cũng được — máy tự chép lời.
- Tên khoá, buổi số mấy, nối tiếp bài nào.
- Muốn **xử lý đoạn bán hàng/quảng cáo** thế nào: mặc định cắt; hoặc giữ làm bài Bonus ở cuối.
- **Lần đầu với thương hiệu mới:** logo (PNG nền trong) + 3 màu chủ đạo (mã hex) + dòng nhãn (vd "BỘ VIDEO E-LEARNING").

## 3. Nói với Claude thế nào

**Bắt đầu** (dán và sửa chỗ trong ngoặc):

> Dùng skill video-to-elearning: cắt video `[đường dẫn video]` (kèm phụ đề `[đường dẫn .vtt]`) thành bài giảng. Khoá: `[tên]`, buổi `[số]`, nối tiếp `[phần/bài]`. Đoạn bán hàng: `[cắt / làm Bonus]`. Mỗi bài 5–12 phút.

**Chạy qua đêm** (sau khi đã duyệt bài mẫu):

> Duyệt rồi. Chạy hàng loạt đến khi xong, rồi kiểm tra chất lượng và xuất danh sách.

## 4. Quy trình & 5 điểm dừng bạn phải duyệt

```
Cài đặt (lần đầu) ─► Phân tích ─► ① PLAN ─► ② Banner thử* ─► ③ Thumbnail ─► ④ Video mẫu ─► Chạy hàng loạt ─► ⑤ Nghiệm thu
```
*Chỉ khi thương hiệu mới. Nếu máy thiếu phần mềm, Claude liệt kê **cài gì, bao nhiêu MB, tải từ đâu** và **chỉ cài khi bạn đồng ý**.

| # | Claude làm | **Bạn duyệt** |
|---|---|---|
| — | Đọc video: tách tiếng, đo khoảng lặng, lấy ảnh, đọc toàn bộ phụ đề; khử ồn + chuẩn âm lượng chạy nền | (nghe thử 3 cặp âm thanh trước/sau, chọn mức khử ồn) |
| ① | Viết **PLAN**: chia phần/bài, đoạn cắt bỏ, bảng đoạn nói nhầm (M1, M2…) kèm đề xuất cắt/giữ | Trả lời: cắt/giữ đoạn nào, giữ phần nào làm Bonus |
| ② | *(thương hiệu mới)* dựng **1 banner** với logo + màu của bạn | OK hay chỉnh |
| ③ | Dựng thumbnail cả bộ (ảnh chụp thật của bài trong khung nghiêng) | Xem ảnh tổng quan, OK hay đổi |
| ④ | Dựng **1 video mẫu** (có chuyển cảnh, nhạc mở đầu) | Xem nhịp, âm thanh, chỗ cắt |
| — | Dựng cả bộ (≈2 phút cho bài 8 phút) | — |
| ⑤ | Kiểm tra chất lượng, xuất danh sách + phụ đề, báo cáo | Xem `qa-report.md`, `cut-log.md`; nhờ sửa nếu cần |

Claude **không được** đi tiếp khi bạn chưa duyệt (trừ khi bạn nói rõ "chạy luôn, tôi đi ngủ" — khi đó Claude vẫn tự kiểm tra bài mẫu trước).

## 5. Máy tự làm gì để video "dễ nghe, dễ xem"

- **Cắt đoạn thừa:** chào hỏi, chờ học viên, loay hoay, nói nhầm, bán hàng — theo PLAN bạn duyệt.
- **Chỗ cắt tự nhiên:** luôn cắt vào khoảng dừng; tiếng cảnh trước nhỏ dần → hình mờ chuyển → tiếng "whoosh" → cảnh sau. Người xem hiểu "cảnh trước đã kết thúc".
- **Khoảng lặng:** 2.5–25 giây tua nhanh 2×; trên 25 giây cắt còn 2 giây (chờ AI chạy, học viên thực hành).
- **Âm thanh:** lọc ù/ồn, chuẩn −16 LUFS (to đều giữa mọi bài).
- **Hình:** tự cắt viền đen có sẵn của bản ghi; video 16:9 lấp đầy khung, video 4:3 nằm trên nền macOS thay vì viền đen.
- **Mở đầu:** đúng thumbnail bạn đã duyệt (4 giây) + nhạc nền + whoosh, vào bài mượt.
- **Bảo mật:** đoạn màn hình lộ mật khẩu/API key luôn bị cắt; Claude cảnh báo trong PLAN.

## 6. Muốn sửa sau khi nhận kết quả — nói thế này

Mở `out/cut-log.md` (mỗi dòng: số video · phút trong video · đoạn gốc đã bỏ · lý do) rồi nói:

| Bạn muốn | Nói với Claude |
|---|---|
| Giữ lại đoạn đã cắt | "Video 12, chỗ cắt lúc 07:23 — giữ lại đoạn đó." |
| Cắt thêm | "Bài D3, cắt từ 05:10 đến 05:40 (đang chờ load)." |
| Đổi tên bài | "Đổi tên bài A2 thành …" |
| Đổi thumbnail | "Thumbnail bài D3 lấy ảnh ở phút 5:20 của bài." / "Tiêu đề thumbnail bài B1 đổi thành …" |
| Đổi điểm bắt đầu/kết thúc | "Bài E4 bắt đầu muộn hơn 10 giây." |
| Đổi nhạc mở đầu | "Dùng nhạc này cho mọi video: `[file]`." |
| Đổi nền thay viền đen | "Dùng nền cồn cát tối thay nền tím." |
| Xem lại một lỗi demo đã cắt | "Cho xem clip M17." |

Bài nào sửa chỉ dựng lại bài đó (vài phút), sau đó Claude chạy lại kiểm tra + phụ đề + nhật ký. *Bài đã đăng lên YouTube/Mux phải đăng lại — nhờ Claude xử lý.*

## 7. Đăng lên YouTube / Mux và nạp website *(chỉ khi bạn nhờ)*

- Mỗi đợt đăng đều dừng để bạn xác nhận: **chế độ riêng tư** (public / unlisted / private; Mux: signed / public), **chủ sở hữu**, **tên khoá**, **danh sách video chính xác**. Không có mặc định.
- Việc bạn tự làm (Claude không làm thay): tạo khoá API/OAuth, bấm "Allow" đăng nhập, nâng gói thanh toán.
- Giới hạn thực tế đã gặp: YouTube ≈20 video/ngày/kênh và giới hạn thumbnail; Mux gói Free tối đa 10 video. Chi tiết trong `SKILL.md` mục 10.
- Cuối cùng `v2e deliver` gom tất cả thành `out/delivery/course.json` (+ `course.md`, `lessons.csv`) để đẩy lên website e-learning.

## 8. Gặp sự cố?

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Đầu bài là màn hình đen | Người nói chưa chia sẻ màn hình | Bảo Claude: "dời điểm bắt đầu bài X tới lúc màn hình hiện" |
| Phụ đề có câu lạ lặp đi lặp lại ("đăng ký kênh…") | Máy chép lời gặp đoạn im lặng | Đã tự gắn cờ và loại; báo Claude nếu còn sót |
| Phụ đề sai tên công cụ | Zoom nghe nhầm tiếng Anh | Nhờ Claude thêm từ vào `work/glossary.json` rồi xuất lại phụ đề |
| Thiếu model/phần mềm | Chưa cài | `v2e doctor` → đồng ý để Claude cài |
| Không thấy tiếng whoosh | Thiếu file hiệu ứng | Có sẵn trong `assets/sfx/`; máy sẽ cảnh báo nếu thiếu |
| Video YouTube bị khoá "riêng tư" mãi | Dự án API chưa được Google duyệt | Xem `SKILL.md` mục 10a |
| Cảnh báo "đứng hình ≥60s" trong QA | Slide/màn hình tĩnh có lời giảng | Bình thường, bỏ qua |

## 9. Cài trên máy mới / cập nhật

```bash
git clone <địa chỉ repo> ~/video-to-elearning && ~/video-to-elearning/install.sh   # cài lần đầu
cd ~/video-to-elearning && git pull && node bin/v2e.mjs doctor                      # cập nhật
```
Hoặc giải nén gói `video-to-elearning-vX.Y.Z.zip` rồi chạy `install.sh`. Chỉ hỗ trợ macOS.

---
Tài liệu kỹ thuật: [docs/QUY-TRINH.md](docs/QUY-TRINH.md) · thumbnail: [docs/THUMBNAIL.md](docs/THUMBNAIL.md) · chỉ dẫn cho Claude: [SKILL.md](SKILL.md)
