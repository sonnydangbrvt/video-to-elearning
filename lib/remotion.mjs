// Gọi Remotion CLI trong remotion/ với public-dir = <dự án>/brand (chỉ chứa ảnh nhỏ).
import { existsSync } from "node:fs";
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
  const props = {
    ...brandProps(edl),
    part: edl.parts?.[l.part] || "",
    lessonCode: l.lessonLabel || `Bài ${l.code}`,
    title: l.thumbTitle || l.title,
    kicker: l.thumbKicker || edl.brand?.thumbKicker || "",
    background: bgFile || edl.brand?.thumbBackground || "thumb-bg-default.png",
    hasCustomBg: !!bgFile,
    // nền AI được dặn chừa trống góc trái trên → Remotion đặt logo; nền mặc định đã có sẵn logo
    logo: bgFile && existsSync(join(P.brand, "logo.png")) ? "logo.png" : "",
    ...extra,
  };
  const pf = P.p("out", "props", `thumb-${l.code}.json`);
  writeJSON(pf, props);
  run(bin(), ["still", "src/index.ts", "LessonThumbnail", outFile, `--props=${pf}`, `--public-dir=${P.brand}`, "--log=error", `--scale=${edl.thumbScale || 1}`], { cwd: REMOTION_DIR });
  return props;
}
