// `v2e leak`: quét OCR từng video thành phẩm tìm chữ nhạy cảm (mật khẩu, tên đăng nhập, khoá API) còn hiện trên màn hình.
// Cắt đúng lúc người nói dán mật khẩu là CHƯA ĐỦ: cửa sổ chat/ghi chú đó thường hiện lại ở nhiều đoạn khác.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEdl } from "./edl.mjs";
import { clock, has, log, project, run, writeText } from "./util.mjs";

function ocr(file) {
  return new Promise((res) => {
    const p = spawn("tesseract", [file, "-", "-l", "eng"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => res(out.toLowerCase()));
    p.on("error", () => res(""));
  });
}

async function scan(video, terms, fps) {
  const dir = mkdtempSync(join(tmpdir(), "v2e-leak-"));
  try {
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `fps=${fps}`, "-q:v", "3", join(dir, "%05d.jpg")]);
    const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
    const hits = [];
    let i = 0;
    const worker = async () => {
      while (i < files.length) {
        const k = i++;
        const t = await ocr(join(dir, files[k]));
        const found = terms.filter((x) => t.includes(x));
        if (found.length) hits.push({ t: k / fps, found });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return hits.sort((a, b) => a.t - b.t);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function leak(args) {
  const P = project(args._[0]);
  if (!has("tesseract")) throw new Error("Thiếu tesseract (brew install tesseract) — dùng để đọc chữ trên khung hình.");
  const edl = loadEdl(P);
  const raw = args.terms === true ? "" : args.terms || (edl.leakTerms || []).join(",");
  const terms = String(raw).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!terms.length) throw new Error('Thiếu chuỗi cần tìm: v2e leak <dir> --terms "tên_đăng_nhập,một_đoạn_mật_khẩu" (hoặc đặt edl.leakTerms).');
  const fps = Number(args.fps) || 0.5;
  let list = edl.lessons;
  if (args.only) { const only = String(args.only).split(","); list = list.filter((l) => only.includes(l.code)); }
  const rows = [];
  let bad = 0;
  for (const l of list) {
    const f = P.p("out", "final", l.file);
    if (!existsSync(f)) { rows.push(`| ${l.code} | ⬜ chưa render | |`); continue; }
    log(`• quét ${l.code}…`);
    const hits = await scan(f, terms, fps);
    if (hits.length) bad++;
    rows.push(`| ${l.code} | ${hits.length ? "❌" : "✅"} | ${hits.length ? hits.map((h) => `${clock(h.t)} (${h.found.join(", ")})`).join("; ") : "—"} |`);
  }
  const md = `# Quét lộ thông tin nhạy cảm\n\nChuỗi tìm: ${terms.map((t) => `\`${t}\``).join(", ")} · ${fps} khung/giây\n\n| Bài | KQ | Thời điểm trong video |\n|---|---|---|\n${rows.join("\n")}\n\n` +
    `Khi có ❌: tìm số cue tại thời điểm đó (out/segmaps/<MÃ>.json), thêm vào danh sách bỏ trong edl.json, render lại bài, quét lại.\n`;
  writeText(P.p("out", "leak-report.md"), md);
  log(`\n${md}`);
  log(bad ? `✗ ${bad} bài còn lộ chữ nhạy cảm — xem out/leak-report.md` : "✔ Không thấy chuỗi nhạy cảm nào");
  if (bad) process.exitCode = 1;
}
