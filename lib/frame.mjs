// Khung trình chiếu: hình nền macOS + cửa sổ kiểu Safari, video đặt vào vùng nội dung.
// Thay cho viền đen khi video gốc không đúng 16:9 (Zoom 1512×982, 1832×982, Retina…).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { REMOTION_DIR, REPO, readJSON, run, writeJSON } from "./util.mjs";

const even = (n) => Math.round(n / 2) * 2;

/** Tính toạ độ cửa sổ + vùng nội dung giữ đúng tỉ lệ video gốc */
export function frameLayout(srcW, srcH, { W = 1920, H = 1080, titleBar = 52, maxW = 0.86, maxH = 0.93 } = {}) {
  const aspect = srcW / srcH;
  const availH = H * maxH - titleBar;
  const cw = even(Math.min(W * maxW, availH * aspect));
  const ch = even(cw / aspect);
  const win = { x: even((W - cw) / 2), y: even((H - (ch + titleBar)) / 2), w: cw, h: ch + titleBar };
  return { win, titleBar, content: { x: win.x, y: win.y + titleBar, w: cw, h: ch } };
}

/**
 * Dò viền đen có sẵn trong video gốc (Zoom hay chèn dải đen quanh màn hình chia sẻ).
 * Lấy 10 mẫu trong bài, bỏ mẫu quá nhỏ (<35% diện tích — nội dung tối), rồi lấy VÙNG BAO NGOÀI
 * → không bao giờ cắt mất nội dung. Kết quả cache ở work/crop/<MÃ>.json.
 */
export function detectCrop(P, l, srcW, srcH) {
  const cache = P.p("work", "crop", `${l.code}.json`);
  const hit = readJSON(cache, null);
  if (hit && hit.start === l.start && hit.end === l.end) return hit.crop;
  const boxes = [];
  for (let i = 0; i < 10; i++) {
    const t = l.start + ((i + 0.5) / 10) * (l.end - l.start);
    const r = run("ffmpeg", ["-hide_banner", "-ss", t.toFixed(2), "-i", P.source(), "-t", "2", "-vf", "cropdetect=limit=24:round=2:reset=0", "-f", "null", "-"], { allowFail: true }).err;
    const m = [...r.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
    if (!m) continue;
    const [w, h, x, y] = m.slice(1).map(Number);
    if (w * h >= 0.35 * srcW * srcH) boxes.push({ x, y, x2: x + w, y2: y + h });
  }
  let crop = { x: 0, y: 0, w: srcW, h: srcH };
  if (boxes.length) {
    const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x2)), y2 = Math.max(...boxes.map((b) => b.y2));
    crop = { x: even(x), y: even(y), w: even(x2 - x), h: even(y2 - y) };
    if (crop.w > srcW - crop.x) crop.w = srcW - crop.x;
    if (crop.h > srcH - crop.y) crop.h = srcH - crop.y;
  }
  writeJSON(cache, { start: l.start, end: l.end, crop, samples: boxes.length });
  return crop;
}

/** edl.frame: { enabled, background, autoCrop } — nền thay cho viền đen (không còn khung cửa sổ). */
export function frameConfig(edl) {
  const f = edl.frame ?? {};
  if (f.enabled === false) return null;
  return { background: f.background || "frame/wallpaper-purple.jpg" };
}

/**
 * Tính cách đặt video lên hình nền: fit theo tỉ lệ vào 1920×1080 (như cũ), phần thừa hiện HÌNH NỀN thay vì đen.
 * Nhanh: chỉ tính toán + dò viền đen (cache), KHÔNG render gì bằng Remotion.
 * Trả về { crop, inner:{w,h}, x, y, wallpaper } hoặc null nếu tắt.
 */
export function bgLayout(P, edl, l, W = 1920, H = 1080) {
  const cfg = frameConfig(edl);
  if (!cfg) return null;
  const v = readJSON(P.p("work", "media.json")).streams.find((s) => s.codec_type === "video");
  const c = edl.frame?.autoCrop === false ? { x: 0, y: 0, w: v.width, h: v.height } : detectCrop(P, l, v.width, v.height);
  const aspect = c.w / c.h;
  const iw = even(Math.min(W, H * aspect)), ih = even(Math.min(H, W / aspect));
  const wallpaper = join(REPO, "assets", cfg.background);
  if (!existsSync(wallpaper)) throw new Error(`Không thấy hình nền: ${cfg.background}`);
  return {
    crop: c.w === v.width && c.h === v.height ? null : c,
    inner: { w: iw, h: ih },
    x: even((W - iw) / 2), y: even((H - ih) / 2),
    wallpaper,
  };
}
