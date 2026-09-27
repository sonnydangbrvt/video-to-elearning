# Prompt tạo ảnh nền thumbnail (chuẩn Coachio)

`v2e thumbs <dir> --prompts` tự điền khối PROMPT bên dưới cho từng bài
(các biến `{...}` lấy từ `edl.json`: `thumbVisual`, `thumbSecondary`, `thumbBadge`, màu brand).
Sửa khối này = đổi phong cách cho mọi dự án sau.

**Nguyên tắc:** AI chỉ vẽ **nền + mockup giao diện ở nửa phải**. Chữ tiếng Việt, logo, mã bài do Remotion đặt
→ không bao giờ sai dấu, đồng bộ cả bộ, đổi tên bài không phải tạo lại ảnh.

<!-- PROMPT -->
```text
Create a 16:9 landscape image (1672x941 or larger), a premium tech-course thumbnail BACKGROUND in the exact visual style of the attached style reference image.

LAYOUT (strict):
- LEFT 45% of the canvas: completely empty, clean off-white background (#F4F5F7) with only a faint light-grey pixel/dot pattern in the bottom-left corner. No objects, no UI, no text there — it is reserved for a title that will be added later.
- TOP-LEFT corner (about 22% width x 16% height): empty, reserved for a logo. Do not draw any logo there.
- RIGHT 55%: bold flat geometric shapes — a large {ORANGE} orange triangle filling the top-right corner, a large {BLUE} royal-blue diagonal block rising from the bottom-right, a few small navy ({INK}) pixel-stair accents and a 2-row dot grid near the top-right.

MAIN SUBJECT (right half, slightly tilted 3D perspective, ~10°):
- A large floating app window / tablet mockup with a thick white rounded border and a soft drop shadow, dark navy (#0F172A) UI, showing: {MAIN_VISUAL}.
- Overlapping its lower-left edge, a smaller floating white card showing: {SECONDARY_CARD}.
- A small floating white rounded-square badge near the bottom-right showing: {TOOL_BADGE}.
- Subtle glowing blue and orange data-flow light streaks inside the main window.

STYLE: modern SaaS product marketing, crisp vector-like UI, clean high-contrast, studio lighting, sharp details, realistic but not photographic, readable short UI labels in ENGLISH only.

DO NOT: add people or faces, add any title/heading text, add Vietnamese text, add watermarks, add a logo in the top-left, place anything in the left 45%.
```
<!-- /PROMPT -->

## Ảnh tham chiếu (reference images) cần đính kèm

| # | Ảnh | Bắt buộc | Lấy ở đâu | Để làm gì |
|---|---|---|---|---|
| 1 | **Style ref** | ✅ | `assets/thumbnail/examples/bg-P7-deploy.png` (hoặc `bg-P12-workflow.png`) | Khoá bố cục, màu, khối hình, độ nghiêng mockup |
| 2 | **Logo công cụ chính của bài** (PNG nền trong) | ✅ nếu bài về 1 công cụ | Trang chủ/press kit của công cụ (Vercel, Supabase, n8n, Claude…) | AI vẽ đúng logo trên badge/cửa sổ |
| 3 | **Ảnh giao diện thật trong bài** | Nên có | `out/thumb-refs/<MÃ>.jpg` (tự trích) hoặc chụp màn hình rõ nét | Mockup giống giao diện học viên sẽ thấy |
| 4 | Ảnh chân dung giảng viên | ❌ (không dùng) | — | Phong cách hiện tại không có người; nếu muốn có người, đổi prompt riêng |

Tên file kết quả: `brand/thumb-bg/<MÃ>.png` (vd `brand/thumb-bg/A4.png`). Kích thước bất kỳ 16:9 ≥ 1280×720.

## Viết `thumbVisual` cho từng bài (trong edl.json)

Mô tả **một màn hình cụ thể, có kết quả**, bằng tiếng Anh, 1–2 câu. Ví dụ đã dùng:

| Bài | thumbVisual | thumbSecondary | thumbBadge |
|---|---|---|---|
| Deploy Vercel | a Vercel dashboard with a green "Deployment Ready" status, a URL "your-app.vercel.app" and a glowing cloud server stack | a dark GitHub repo card with branch "main", file tree and recent commits | the Vercel triangle logo |
| Workflow AI | an "AI Workflow Blueprint" node graph: Brainstorm → Plan → Research / Create → Launch, each node with a green check | a "Workflow Performance" card with 4 metrics (Tasks 128, Time saved 36.4 hrs, Efficiency 92%, Success 98%) | a blue four-point sparkle icon |
| Antigravity | the Antigravity IDE with a chat panel "Build a modern dashboard…" and a code editor showing React code | an "Analytics Overview" card with 3 mini line charts | the Antigravity rainbow "A" logo |
| Supabase | a Supabase table editor with a "users" table and an SQL editor running CREATE TABLE | an "Authentication" card showing a new user signed up with a green check | the Supabase green lightning logo |
| n8n | an n8n workflow canvas: Telegram trigger → AI node → NocoDB → reply, all nodes green | a Telegram chat bubble "Expense saved: 45,000 VND" rendered as a phone card | the n8n logo |

Tiêu đề trên thumbnail (`thumbTitle`) nên **≤ 6 từ, có 1 từ khoá tô màu** bằng `**…**`: `Deploy lên **Vercel** trong 10 phút`.
