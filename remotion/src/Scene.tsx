import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";

/**
 * Bố cục cảnh bài học — mockup ảnh tĩnh để chọn phương án trình bày video trong khung 1920×1080.
 * mode:
 *  - "full":   video lấp đầy khung (đã bỏ viền đen) — không cần nền.
 *  - "framed": video thu nhỏ, bo góc + đổ bóng, đặt giữa trên hình nền macOS (nền hiện quanh 4 phía).
 *  - "band":   video rộng gần hết, nền macOS hiện thành dải trên + dưới.
 */
export const sceneSchema = z.object({
  screenshot: z.string(),
  background: z.string(),
  mode: z.enum(["full", "framed", "band"]),
  margin: z.number(),
  radius: z.number(),
});
export type SceneProps = z.infer<typeof sceneSchema>;

export const sceneDefaults: SceneProps = {
  screenshot: "shot-169.jpg",
  background: "wallpaper-purple.jpg",
  mode: "framed",
  margin: 90,
  radius: 22,
};

export const Scene: React.FC<SceneProps> = ({ screenshot, background, mode, margin, radius }) => {
  if (mode === "full") {
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Img src={staticFile(screenshot)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    );
  }
  const inset = mode === "band" ? { top: margin, bottom: margin, left: 0, right: 0 } : { top: margin, bottom: margin, left: margin, right: margin };
  return (
    <AbsoluteFill>
      <Img src={staticFile(background)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ ...inset, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            maxWidth: "100%", maxHeight: "100%", borderRadius: radius, overflow: "hidden",
            boxShadow: "0 30px 80px rgba(15,10,50,0.55), 0 8px 24px rgba(15,10,50,0.35), 0 0 0 1px rgba(255,255,255,0.10)",
            aspectRatio: "auto",
          }}
        >
          <Img src={staticFile(screenshot)} style={{ display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
