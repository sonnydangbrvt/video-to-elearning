// Gọi Remotion CLI trong remotion/ với public-dir = <dự án>/brand (chỉ chứa ảnh nhỏ).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REMOTION_DIR, run, writeJSON } from "./util.mjs";

const bin = () => {
  const b = join(REMOTION_DIR, "node_modules", ".bin", "remotion");
  if (!existsSync(b)) throw new Error("Chưa cài Remotion. Chạy: v2e doctor --install");
  return b;
};

export function brandProps(edl) {
  const b = edl.brand || {};
  return {
    buoi: b.buoi || "",
    ink: b.ink || "#0f2547",
    orange: b.orange || "#F1591F",
    blue: b.blue || "#2563EB",
    logoText: b.logoText || "",
  };
}

export function renderIntro(P, edl, l, outFile, { fps, width = 1920, height = 1080 }) {
  const props = {
    ...brandProps(edl),
    part: edl.parts?.[l.part] || "",
    lessonCode: l.lessonLabel || `Bài ${l.code}`,
    title: l.title,
    background: edl.brand?.introBackground || "intro-bg.png",
    fps, width, height,
    seconds: edl.introSeconds || 4,
  };
  const pf = P.p("out", "props", `intro-${l.code}.json`);
  writeJSON(pf, props);
  run(bin(), ["render", "src/index.ts", "LessonIntro", outFile, `--props=${pf}`, `--public-dir=${P.brand}`, "--log=error", "--codec=h264", "--crf=18"], { cwd: REMOTION_DIR });
}

export function renderThumb(P, edl, l, outFile, extra = {}) {
  const bgFile = [`thumb-bg/${l.code}.png`, `thumb-bg/${l.code}.jpg`].find((f) => existsSync(join(P.brand, f)));
  // chế độ screenshot: nền vẽ bằng code + ảnh chụp thật của bài (khi chưa có nền AI riêng)
  const shot = !bgFile && existsSync(join(P.brand, "thumb-shots", `${l.code}.jpg`)) ? `thumb-shots/${l.code}.jpg` : "";
  const props = {
    ...brandProps(edl),
    part: edl.parts?.[l.part] || "",
    lessonCode: l.lessonLabel || `Bài ${l.code}`,
    title: l.thumbTitle || l.title,
    kicker: l.thumbKicker || edl.brand?.thumbKicker || "",
    background: bgFile || edl.brand?.thumbBackground || "thumb-bg-default.png",
    hasCustomBg: !!bgFile,
    // nền AI được dặn chừa trống góc trái trên → Remotion đặt logo; nền mặc định đã có sẵn logo
    logo: (bgFile || shot) && existsSync(join(P.brand, "logo.png")) ? "logo.png" : "",
    screenshot: shot,
    // dòng nhấn mạnh chung cả bộ (vd "LÀM CHỦ MÔ HÌNH\n**MUSE AI** MỚI") + mascot (nằm trong brand/ của dự án)
    headline: l.thumbHeadline ?? edl.brand?.thumbHeadline ?? "",
    mascot: (() => { const m = edl.brand?.thumbMascot; return m && existsSync(join(P.brand, m)) ? m : ""; })(),
    ...extra,
  };
  const pf = P.p("out", "props", `thumb-${l.code}.json`);
  writeJSON(pf, props);
  run(bin(), ["still", "src/index.ts", "LessonThumbnail", outFile, `--props=${pf}`, `--public-dir=${P.brand}`, "--log=error", `--scale=${edl.thumbScale || 1}`], { cwd: REMOTION_DIR });
  return props;
}

/**
 * Thẻ chữ chủ đề (PNG nền trong suốt 820×210) cho mỗi `callouts[]` của bài. Cache theo nội dung → chỉ dựng lại khi sửa chữ.
 * Trả về đường dẫn PNG theo thứ tự callouts.
 */
export function renderCallouts(P, edl, l) {
  const dir = P.p("out", "callouts");
  mkdirSync(dir, { recursive: true });
  const b = brandProps(edl);
  return (l.callouts || []).map((c, i) => {
    const png = join(dir, `${l.code}-${String(i + 1).padStart(2, "0")}.png`);
    const key = JSON.stringify([c.title, c.sub, c.icon, b.ink, b.orange, b.blue]);
    const stamp = png + ".key";
    if (existsSync(png) && existsSync(stamp) && readFileSync(stamp, "utf8") === key) return png;
    const pf = P.p("out", "props", `callout-${l.code}-${i + 1}.json`);
    writeJSON(pf, { title: c.title, sub: c.sub || "", icon: c.icon || "", ink: b.ink, orange: b.orange, blue: b.blue });
    run(bin(), ["still", "src/index.ts", "Callout", png, `--props=${pf}`, "--log=error", "--image-format=png"], { cwd: REMOTION_DIR });
    writeFileSync(stamp, key);
    return png;
  });
}
