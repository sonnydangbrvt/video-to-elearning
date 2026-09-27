import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { fontFamily } from "./font";

/**
 * Khung trình chiếu cho video bài học: hình nền (wallpaper macOS) + cửa sổ kiểu Safari
 * (3 nút, thanh địa chỉ, bo góc, đổ bóng). Vùng nội dung để TRỐNG — ffmpeg overlay video vào đúng
 * toạ độ `content` (tính ở lib/frame.mjs). WindowMask = mặt nạ bo góc dưới cho vùng nội dung.
 */
export const windowFrameSchema = z.object({
  background: z.string(),
  url: z.string(),
  theme: z.enum(["light", "dark"]),
  win: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  titleBar: z.number(),
  radius: z.number(),
  canvas: z.object({ w: z.number(), h: z.number() }),
});
export type WindowFrameProps = z.infer<typeof windowFrameSchema>;

export const windowFrameDefaults: WindowFrameProps = {
  background: "frame/wallpaper-purple.jpg",
  url: "coachio.academy · Vibe Code 3D · Bài C3",
  theme: "light",
  win: { x: 236, y: 36, w: 1448, h: 1008 },
  titleBar: 52,
  radius: 18,
  canvas: { w: 1920, h: 1080 },
};

export const WindowFrame: React.FC<WindowFrameProps> = ({ background, url, theme, win, titleBar, radius, canvas }) => {
  const dark = theme === "dark";
  // Khoét lỗ trong suốt đúng vùng nội dung (bo 2 góc dưới) → video được đặt BÊN DƯỚI lớp khung này.
  const { x, w } = win, y = win.y + titleBar, h = win.h - titleBar, r = radius;
  const hole = `M0 0 H${canvas.w} V${canvas.h} H0 Z M${x} ${y} H${x + w} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} Z`;
  const bar = dark ? "linear-gradient(#3a3a3c, #2c2c2e)" : "linear-gradient(#f4f4f5, #e4e4e7)";
  return (
    <AbsoluteFill style={{ fontFamily, clipPath: `path(evenodd, "${hole}")` }}>
      <Img src={staticFile(background)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div
        style={{
          position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: radius,
          background: dark ? "#1c1c1e" : "#f0f0f0", overflow: "hidden",
          boxShadow: "0 40px 90px rgba(20,10,60,0.45), 0 12px 30px rgba(20,10,60,0.25), 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ height: titleBar, background: bar, borderBottom: `1px solid ${dark ? "#000" : "#d4d4d8"}`, display: "flex", alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", gap: 9, marginLeft: 20 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.25)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginLeft: 26, color: dark ? "#8e8e93" : "#a1a1aa", fontSize: 22, fontWeight: 500 }}>
            <span>‹</span><span>›</span>
          </div>
          <div
            style={{
              position: "absolute", left: "50%", transform: "translateX(-50%)", minWidth: "42%", height: 32, borderRadius: 9,
              background: dark ? "#48484a" : "#ffffff", boxShadow: dark ? "none" : "0 0 0 1px #e4e4e7",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 18px",
              color: dark ? "#e5e5ea" : "#3f3f46", fontSize: 17, fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 13, opacity: 0.6 }}>🔒</span>
            {url}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

