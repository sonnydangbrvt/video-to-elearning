import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fontFamily } from "./font";
import { Rich, plain } from "./rich";

/**
 * Thumbnail 1280×720 (render --scale=1.5 → 1920×1080).
 * Nền: ảnh AI tạo theo PROMPT-TEMPLATE (nửa trái trống) hoặc nền mặc định của brand.
 * Chữ luôn do Remotion đặt → đúng dấu tiếng Việt, đồng bộ cả bộ, sửa tên bài không phải tạo lại ảnh.
 */
export const lessonThumbnailSchema = z.object({
  buoi: z.string(),
  part: z.string(),
  lessonCode: z.string(),
  title: z.string(),
  kicker: z.string(),
  background: z.string(),
  hasCustomBg: z.boolean(),
  logo: z.string(),
  screenshot: z.string(),
  headline: z.string(),
  mascot: z.string(),
  ink: zColor(),
  orange: zColor(),
  blue: zColor(),
});
export type LessonThumbnailProps = z.infer<typeof lessonThumbnailSchema>;

export const lessonThumbnailDefaults: LessonThumbnailProps = {
  buoi: "BUỔI 2",
  part: "PHẦN 7",
  lessonCode: "BÀI 7.3",
  title: "Deploy lên **Vercel** trong 10 phút",
  kicker: "BỘ VIDEO E-LEARNING",
  background: "thumb-bg-default.png",
  hasCustomBg: false,
  logo: "",
  screenshot: "",
  headline: "",
  mascot: "",
  ink: "#0f2547",
  orange: "#F1591F",
  blue: "#2563EB",
};

/** Nền phong cách Coachio vẽ bằng code + ảnh chụp màn hình thật của bài trong khung thiết bị nghiêng. */
const ScreenshotStage: React.FC<{ screenshot: string; ink: string; orange: string; blue: string; compact?: boolean }> = ({ screenshot, ink, orange, blue, compact }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: "#F4F5F7" }} />
    <AbsoluteFill style={{ background: orange, clipPath: "polygon(66% 0, 100% 0, 100% 58%)" }} />
    <AbsoluteFill style={{ background: blue, clipPath: "polygon(50% 100%, 100% 34%, 100% 100%)" }} />
    {/* chấm 2 hàng góc trên phải */}
    <div style={{ position: "absolute", right: 40, top: 26, display: "grid", gridTemplateColumns: "repeat(10, 8px)", gap: 14 }}>
      {Array.from({ length: 20 }).map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: ink }} />)}
    </div>
    {/* pixel góc dưới trái */}
    <div style={{ position: "absolute", left: 18, bottom: 150, display: "grid", gridTemplateColumns: "repeat(6, 16px)", gap: 6, opacity: 0.12 }}>
      {Array.from({ length: 30 }).map((_, i) => <div key={i} style={{ width: 16, height: 16, background: (i * 7) % 3 ? blue : "transparent" }} />)}
    </div>
    {/* bậc pixel xanh đậm (ẩn khi có headline+mascot để không chạm chữ) */}
    {!compact && (
      <>
        <div style={{ position: "absolute", left: 560, top: 60, width: 34, height: 34, background: blue }} />
        <div style={{ position: "absolute", left: 594, top: 26, width: 34, height: 34, background: blue }} />
        <div style={{ position: "absolute", left: 540, top: 94, width: 20, height: 20, background: ink }} />
      </>
    )}
    {/* khung thiết bị */}
    <div style={{ position: "absolute", left: compact ? 705 : 600, top: compact ? 78 : 118, width: compact ? 520 : 640, perspective: 1600 }}>
      <div style={{ transform: "rotateY(-14deg) rotateZ(2deg)", transformOrigin: "left center", background: "#fff", padding: 12, borderRadius: 26, boxShadow: `0 30px 60px rgba(15,37,71,0.35), 0 0 0 3px ${ink}` }}>
        <div style={{ background: "#0f172a", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ height: 26, display: "flex", alignItems: "center", gap: 7, paddingLeft: 12 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}
          </div>
          <Img src={staticFile(screenshot)} style={{ display: "block", width: "100%", aspectRatio: "3 / 2", objectFit: "cover", objectPosition: "center" }} />
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

export const LessonThumbnail: React.FC<LessonThumbnailProps> = ({ buoi, part, lessonCode, title, kicker, background, logo, screenshot, headline, mascot, ink, orange, blue }) => {
  const len = plain(title).length;
  const hasHead = !!headline;
  const size = hasHead ? (len <= 18 ? 58 : len <= 30 ? 50 : len <= 44 ? 44 : 38) : (len <= 18 ? 76 : len <= 30 ? 62 : len <= 44 ? 52 : 44);
  const headLines = headline.split("\n");
  const pillText = [buoi, part].filter(Boolean).join(" · ");
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f5f7", fontFamily }}>
      {screenshot ? <ScreenshotStage screenshot={screenshot} ink={ink} orange={orange} blue={blue} compact={hasHead && !!mascot} /> : <Img src={staticFile(background)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {/* làm dịu nửa trái để chữ luôn đọc được, kể cả khi ảnh AI lấn sang trái */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "22%", bottom: 0, background: "linear-gradient(90deg, rgba(244,245,247,0.9) 0%, rgba(244,245,247,0.7) 34%, rgba(244,245,247,0) 44%)" }} />
      {logo && <Img src={staticFile(logo)} style={{ position: "absolute", left: 34, top: 26, height: 70 }} />}
      {mascot && <Img src={staticFile(mascot)} style={{ position: "absolute", right: -6, bottom: -8, width: 450, height: 450, filter: "drop-shadow(0 18px 28px rgba(15,37,71,0.35))" }} />}
      <div style={{ position: "absolute", left: 56, top: hasHead ? 108 : 110, bottom: 70, width: hasHead ? "55%" : "39%", display: "flex", flexDirection: "column", justifyContent: hasHead ? "flex-start" : "center" }}>
        {hasHead && (
          <div style={{ marginBottom: 22 }}>
            {headLines.map((ln, i) => (
              <div key={i} style={{ fontSize: i === 0 ? 50 : 96, lineHeight: i === 0 ? 1.05 : 0.98, fontWeight: 900, color: ink, letterSpacing: i === 0 ? 1 : -2, textShadow: "0 2px 0 rgba(255,255,255,0.8)" }}>
                <Rich text={ln} accent={orange} />
              </div>
            ))}
            <div style={{ marginTop: 10, height: 8, width: 150, borderRadius: 4, background: blue }} />
          </div>
        )}
        {pillText && (
          <div style={{ alignSelf: "flex-start", background: orange, color: "#fff", fontSize: 22, fontWeight: 800, letterSpacing: 0.5, padding: "8px 16px", borderRadius: 8 }}>{pillText}</div>
        )}
        <div style={{ marginTop: hasHead ? 16 : 20, fontSize: size, lineHeight: 1.06, fontWeight: 900, color: ink, letterSpacing: -1, textWrap: "balance", maxWidth: hasHead ? 640 : undefined }}>
          <Rich text={title} accent={blue} />
        </div>
        <div style={{ marginTop: hasHead ? 18 : 22, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: blue, color: "#fff", fontSize: 26, fontWeight: 800, padding: "8px 18px", borderRadius: 8, boxShadow: `4px 4px 0 ${ink}` }}>{lessonCode}</div>
          <div style={{ height: 7, width: 90, borderRadius: 4, background: orange }} />
        </div>
      </div>
      {kicker && (
        <div style={{ position: "absolute", left: 56, bottom: 34, border: `3px solid ${ink}`, color: ink, fontSize: 20, fontWeight: 800, letterSpacing: 2, padding: "6px 14px", background: "rgba(255,255,255,0.85)" }}>{kicker}</div>
      )}
    </AbsoluteFill>
  );
};
