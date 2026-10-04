import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fontFamily } from "./font";

/**
 * Thẻ chữ chủ đề hiện bên trái video (ảnh PNG nền trong suốt, ffmpeg overlay + fade/trượt).
 * Cỡ cố định 820×210 để ffmpeg đặt ở toạ độ cố định trên khung 1920×1080.
 */
export const calloutSchema = z.object({
  title: z.string(),
  sub: z.string(),
  icon: z.string(),
  ink: zColor(),
  orange: zColor(),
  blue: zColor(),
});
export type CalloutProps = z.infer<typeof calloutSchema>;

export const calloutDefaults: CalloutProps = { title: "Năng lực 1", sub: "Bộ nhớ chuyển nhà", icon: "🧠", ink: "#0f2547", orange: "#F1591F", blue: "#2563EB" };

export const Callout: React.FC<CalloutProps> = ({ title, sub, icon, ink, orange, blue }) => (
  <AbsoluteFill style={{ fontFamily, background: "transparent", justifyContent: "center", padding: "0 10px 0 6px" }}>
    <div style={{ display: "flex", alignItems: "stretch", borderRadius: 22, overflow: "hidden", background: "rgba(255,255,255,0.97)", boxShadow: "0 14px 34px rgba(15,37,71,0.38), 0 0 0 2px rgba(15,37,71,0.08)" }}>
      <div style={{ width: 14, background: `linear-gradient(180deg, ${orange}, ${blue})` }} />
      <div style={{ width: 112, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, background: "rgba(37,99,235,0.07)" }}>{icon}</div>
      <div style={{ padding: "20px 30px 20px 22px", display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: ink, lineHeight: 1.1, letterSpacing: -0.5 }}>{title}</div>
        {sub && <div style={{ marginTop: 8, fontSize: 26, fontWeight: 600, color: "#475569", lineHeight: 1.25 }}>{sub}</div>}
      </div>
    </div>
  </AbsoluteFill>
);
