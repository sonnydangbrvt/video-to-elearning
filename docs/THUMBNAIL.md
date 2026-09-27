# Thumbnail bài học

![mẫu](../assets/thumbnail/sample-thumbnail.png)

**Công thức:** ảnh nền 16:9 (nửa trái trống, mockup công cụ ở nửa phải) + lớp chữ Remotion (pill Buổi·Phần, tiêu đề có 1 từ khoá tô màu, chip mã bài, nhãn "BỘ VIDEO E-LEARNING").
Chữ luôn do Remotion đặt → đúng dấu tiếng Việt, cả bộ đồng bộ, đổi tên bài chỉ cần render lại (1 giây/ảnh).

## Bước bắt buộc lần đầu: bộ nhận diện + 1 banner thử (Gate G2)

Brand mới → hỏi **logo** (PNG nền trong), **3 màu** (ink/chữ, accent 1 cho pill, accent 2 cho từ khoá & chip mã bài), **kicker** ("BỘ VIDEO E-LEARNING"),
lưu `brand/logo.png` + `edl.json › brand` → render **1 banner** (`v2e thumbs <dir> --only <MÃ>`) → chờ duyệt → `touch brand/APPROVED` → mới render cả bộ.

## Ba phương án

### 0. Ảnh chụp thật trong khung thiết bị (mặc định, `thumbMode: "screenshot"`)
Nền vẽ bằng code theo brand (khối cam góc trên phải, khối xanh chéo, chấm, bậc pixel) + **khung hình thật của bài** trong khung thiết bị nghiêng + logo + tiêu đề.
Chọn khung: trích 4 ứng viên/bài (20/40/60/80 %), ghép lưới, chọn ảnh trực quan nhất (mô hình 3D, màn hình kết quả, app chạy) → `thumbFrameAt` (giây). Tránh slide nhiều chữ, màn hình trống, trang đăng nhập.
Ảnh trích tự động vào `brand/thumb-shots/<MÃ>.jpg` (`--force` để trích lại sau khi đổi `thumbFrameAt`).


| | A. Nhanh | B. Nền riêng từng bài |
|---|---|---|
| Nền | `brand/thumb-bg-default.png` dùng chung | ảnh AI tạo theo prompt, mỗi bài một ảnh |
| Công sức | 0 | ~1 phút/bài (tạo ảnh + lưu file) |
| Khi nào | bài nội bộ, cần gấp | khoá bán, đăng YouTube/landing |

## Phương án B từng bước

1. Trong `edl.json`, mỗi bài thêm:
   - `thumbTitle`: ≤ 6 từ, 1 từ khoá bọc `**…**` → `"Deploy lên **Vercel** trong 10 phút"`
   - `thumbVisual`: (tiếng Anh) màn hình chính có kết quả rõ ràng
   - `thumbSecondary`: thẻ phụ nhỏ (số liệu/kết quả)
   - `thumbBadge`: logo công cụ trên badge
   - `thumbFrameAt` (tuỳ chọn): giây trong video gốc để lấy ảnh giao diện tham chiếu
2. `v2e thumbs <dir> --prompts` → `out/thumb-prompts.md` (prompt đã điền sẵn cho từng bài) + `out/thumb-refs/<MÃ>.jpg`.
3. Với mỗi bài, mở công cụ tạo ảnh (ChatGPT/GPT-Image, Gemini, Midjourney…) → **đính kèm ảnh tham chiếu** → dán prompt.
4. Lưu ảnh về `brand/thumb-bg/<MÃ>.png`.
5. `v2e thumbs <dir>` → `out/thumb/NN-MÃ.png`. Nếu có nền riêng, logo brand (`brand/logo.png`) được đặt tự động ở góc trái trên.

## Ảnh tham chiếu cần chuẩn bị

| # | Ảnh | Bắt buộc | Nguồn |
|---|---|---|---|
| 1 | Style ref | ✅ | `assets/thumbnail/examples/bg-P7-deploy.png` (hoặc `bg-P12-workflow.png`, `bg-antigravity.png`) |
| 2 | Logo công cụ chính của bài (PNG nền trong) | ✅ nếu bài về 1 công cụ | press kit / trang chủ công cụ |
| 3 | Ảnh giao diện thật | nên có | `out/thumb-refs/<MÃ>.jpg` hoặc ảnh chụp màn hình rõ hơn |
| 4 | Logo brand | chỉ khi đổi brand | thay `assets/brand/logo.png` |

## Prompt chuẩn

Nằm trong [assets/thumbnail/PROMPT-TEMPLATE.md](../assets/thumbnail/PROMPT-TEMPLATE.md) (khối giữa `<!-- PROMPT -->`). Sửa file này = đổi phong cách cho mọi dự án sau.
Các điểm then chốt: chừa trống 45% bên trái và góc logo · khối cam góc trên phải, khối xanh chéo góc dưới phải · mockup nghiêng ~10°, viền trắng dày ·
chữ trên UI chỉ bằng tiếng Anh · không người, không tiêu đề, không watermark.

## Checklist duyệt thumbnail

- [ ] Tiêu đề đọc được khi thu nhỏ còn 320px
- [ ] Chữ không đè lên mockup (nếu đè: rút gọn `thumbTitle` hoặc tạo lại nền có nửa trái trống hơn)
- [ ] Logo công cụ đúng (AI hay vẽ sai logo; nếu sai thì đính kèm logo và tạo lại)
- [ ] Cả bộ cùng bố cục; màu pill/chip đúng brand
- [ ] Không có chữ tiếng Việt do AI vẽ (dễ sai dấu)

## Đổi brand

Thay các file trong `assets/brand/` (`intro-bg.png` 16:9 nửa trái trống, `thumb-bg-default.png`, `logo.png`), đổi màu trong `edl.json › brand`
(`ink`, `orange`, `blue`) và mã màu trong `PROMPT-TEMPLATE.md`. Xem trực tiếp bằng `cd remotion && npm run studio`.
