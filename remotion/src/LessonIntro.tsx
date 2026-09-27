import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fontFamily } from "./font";
import { Rich, plain } from "./rich";

/**
 * Card intro trước mỗi bài. Nền = ảnh template brand (nửa trái trống),
 * Remotion đặt chữ vào nửa trái. Crossfade sang bài được làm lúc ghép bằng ffmpeg xfade.
 * fps / kích thước / thời lượng lấy từ props (calculateMetadata) để khớp video nguồn.
 */
export const lessonIntroSchema = z.object({
  buoi: z.string(),
  part: z.string(),
  lessonCode: z.string(),
  title: z.string(),
  background: z.string(),
  ink: zColor(),
  orange: zColor(),
  blue: zColor(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  seconds: z.number(),
});
export type LessonIntroProps = z.infer<typeof lessonIntroSchema>;

export const lessonIntroDefaults: LessonIntroProps = {
  buoi: "BUỔI 2",
  part: "PHẦN 7 · GitHub → Vercel",
  lessonCode: "Bài 7.3",
  title: "Deploy lên **Vercel**: kết nối GitHub & xuất bản",
  background: "intro-bg.png",
  ink: "#0f2547",
  orange: "#F1591F",
  blue: "#2563EB",
  fps: 25,
  width: 1920,
  height: 1080,
  seconds: 4,
};

export const LessonIntro: React.FC<LessonIntroProps> = ({ buoi, part, lessonCode, title, background, ink, orange, blue, width }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = width / 1920; // scale chữ theo độ phân giải
  const s = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 130, mass: 0.7 } });
  const pill = s(4), head = s(12), code = s(22), rule = s(28);
  const y = (sp: number, d = 34) => interpolate(sp, [0, 1], [d * k, 0]);
  const len = plain(title).length;
  const titleSize = (len > 46 ? 58 : len > 32 ? 66 : 78) * k;
  const pillText = [buoi, part].filter(Boolean).join(" · ");

  return (
    <AbsoluteFill style={{ backgroundColor: "#eef1f5", fontFamily }}>
      <Img src={staticFile(background)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", left: "6%", top: 0, bottom: 0, width: "42%", display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: "8%" }}>
        {pillText && (
          <div style={{ alignSelf: "flex-start", backgroundColor: orange, color: "#fff", fontSize: 30 * k, fontWeight: 800, letterSpacing: 1, padding: `${10 * k}px ${22 * k}px`, borderRadius: 10 * k, opacity: pill, transform: `translateY(${y(pill)}px)` }}>
            {pillText}
          </div>
        )}
        <div style={{ marginTop: 26 * k, fontSize: titleSize, lineHeight: 1.1, fontWeight: 800, color: ink, opacity: head, transform: `translateY(${y(head, 44)}px)`, textWrap: "balance" }}>
          <Rich text={title} accent={blue} />
        </div>
        <div style={{ marginTop: 28 * k, height: 8 * k, width: interpolate(rule, [0, 1], [0, 180 * k]), borderRadius: 4 * k, backgroundColor: orange }} />
        <div style={{ marginTop: 22 * k, fontSize: 34 * k, fontWeight: 700, color: blue, opacity: code, transform: `translateY(${y(code)}px)` }}>{lessonCode}</div>
      </div>
    </AbsoluteFill>
  );
};
