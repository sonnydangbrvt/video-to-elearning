// `v2e thumbs`: thumbnail 16:9 cho từng bài = ảnh nền (AI tạo theo prompt, hoặc nền mặc định)
// + chữ Remotion (phần, tiêu đề, mã bài). `--prompts` sinh sẵn câu lệnh tạo ảnh + ảnh tham chiếu.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEdl } from "./edl.mjs";
import { renderThumb } from "./remotion.mjs";
import { REPO, clock, ensureDirs, log, project, readJSON, writeText } from "./util.mjs";

const TEMPLATE_FILE = join(REPO, "assets", "thumbnail", "PROMPT-TEMPLATE.md");

/** Lấy khối prompt tiếng Anh nằm giữa <!-- PROMPT --> … <!-- /PROMPT --> */
export function promptTemplate() {
  const md = readFileSync(TEMPLATE_FILE, "utf8");
  const m = md.match(/<!-- PROMPT -->\s*```(?:text)?\n([\s\S]*?)```\s*<!-- \/PROMPT -->/);
  if (!m) throw new Error("Không thấy khối PROMPT trong PROMPT-TEMPLATE.md");
  return m[1].trim();
}

export function fillPrompt(edl, l) {
  const b = edl.brand || {};
  return promptTemplate()
    .replaceAll("{MAIN_VISUAL}", l.thumbVisual || `a clean app screen that clearly represents: "${l.title}"`)
    .replaceAll("{SECONDARY_CARD}", l.thumbSecondary || "a small floating result card with 3–4 key metrics and a green check mark")
    .replaceAll("{TOOL_BADGE}", l.thumbBadge || "the main tool's logo as a white rounded-square app icon")
    .replaceAll("{ORANGE}", b.orange || "#F1591F")
    .replaceAll("{BLUE}", b.blue || "#2563EB")
    .replaceAll("{INK}", b.ink || "#0f2547");
}

/** frame giữa bài từ work/frames → ảnh tham chiếu giao diện thật */
function pickFrame(P, l) {
  const idx = readJSON(P.p("work", "frames", "index.json"), null);
  if (!idx) return null;
  const mid = l.thumbFrameAt ?? (l.start + l.end) / 2;
  const inside = idx.frames.filter((f) => f.t >= l.start && f.t <= l.end);
  const pool = inside.length ? inside : idx.frames;
  const best = pool.reduce((a, f) => (Math.abs(f.t - mid) < Math.abs(a.t - mid) ? f : a), pool[0]);
  return best ? P.p("work", best.file) : null;
}

export function thumbs(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  ensureDirs(P.p("out", "thumb"), P.p("brand", "thumb-bg"), P.p("out", "thumb-refs"));

  if (args.prompts) {
    let md = `# Câu lệnh tạo ảnh nền thumbnail — ${edl.course || P.meta().title}\n\n` +
      `Cách dùng: mỗi bài → mở công cụ tạo ảnh (ChatGPT/GPT-Image, Gemini, Midjourney…) → **đính kèm ảnh tham chiếu** → dán prompt → tải ảnh 16:9 về, lưu thành \`brand/thumb-bg/<MÃ>.png\` → chạy \`v2e thumbs\`.\n\n` +
      `**Ảnh tham chiếu đính kèm cho MỌI bài:**\n1. Style ref (bắt buộc): \`${join(REPO, "assets/thumbnail/examples/bg-P7-deploy.png")}\`\n2. Logo công cụ chính của bài (PNG nền trong, tự tải từ trang chủ công cụ)\n3. Ảnh giao diện thật trong bài: \`out/thumb-refs/<MÃ>.jpg\` (tự trích từ video — thay bằng ảnh chụp màn hình rõ hơn nếu có)\n\n` +
      `> Xem hướng dẫn đầy đủ: \`${join(REPO, "docs/THUMBNAIL.md")}\`\n\n`;
    for (const l of edl.lessons) {
      const fr = pickFrame(P, l);
      if (fr && existsSync(fr)) copyFileSync(fr, P.p("out", "thumb-refs", `${l.code}.jpg`));
      md += `---\n\n## ${l.code} — ${l.title}\n\n- Chữ trên thumbnail (Remotion tự đặt, KHÔNG để AI vẽ chữ): **${l.thumbTitle || l.title}**\n- Ảnh giao diện tham chiếu: \`out/thumb-refs/${l.code}.jpg\` (${clock(l.thumbFrameAt ?? (l.start + l.end) / 2)})\n- Lưu kết quả: \`brand/thumb-bg/${l.code}.png\`\n\n\`\`\`text\n${fillPrompt(edl, l)}\n\`\`\`\n\n`;
    }
    writeText(P.p("out", "thumb-prompts.md"), md);
    log(`✔ out/thumb-prompts.md (${edl.lessons.length} prompt) + out/thumb-refs/*.jpg`);
    return;
  }

  let list = edl.lessons;
  if (args.only) { const only = String(args.only).split(","); list = list.filter((l) => only.includes(l.code)); }
  for (const l of list) {
    const f = P.p("out", "thumb", `${String(l.index).padStart(2, "0")}-${l.code}.png`);
    const props = renderThumb(P, edl, l, f);
    log(`  ✔ ${f.split("/").slice(-2).join("/")}  (nền: ${props.background})`);
  }
  const missing = edl.lessons.filter((l) => !["png", "jpg"].some((x) => existsSync(P.p("brand", "thumb-bg", `${l.code}.${x}`))));
  if (missing.length) log(`\nℹ️ ${missing.length} bài đang dùng nền mặc định. Muốn nền riêng từng bài: v2e thumbs "${args._[0]}" --prompts`);
}
