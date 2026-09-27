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
  ink: "#0f2547",
  orange: "#F1591F",
  blue: "#2563EB",
};

export const LessonThumbnail: React.FC<LessonThumbnailProps> = ({ buoi, part, lessonCode, title, kicker, background, logo, ink, orange, blue }) => {
  const len = plain(title).length;
  const size = len <= 18 ? 76 : len <= 30 ? 62 : len <= 44 ? 52 : 44;
  const pillText = [buoi, part].filter(Boolean).join(" · ");
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f5f7", fontFamily }}>
      <Img src={staticFile(background)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {/* làm dịu nửa trái để chữ luôn đọc được, kể cả khi ảnh AI lấn sang trái */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "22%", bottom: 0, background: "linear-gradient(90deg, rgba(244,245,247,0.9) 0%, rgba(244,245,247,0.7) 34%, rgba(244,245,247,0) 44%)" }} />
      {logo && <Img src={staticFile(logo)} style={{ position: "absolute", left: 34, top: 26, height: 70 }} />}
      <div style={{ position: "absolute", left: 56, top: 110, bottom: 70, width: "39%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {pillText && (
          <div style={{ alignSelf: "flex-start", background: orange, color: "#fff", fontSize: 22, fontWeight: 800, letterSpacing: 0.5, padding: "8px 16px", borderRadius: 8 }}>{pillText}</div>
        )}
        <div style={{ marginTop: 20, fontSize: size, lineHeight: 1.06, fontWeight: 900, color: ink, letterSpacing: -1, textWrap: "balance" }}>
          <Rich text={title} accent={blue} />
        </div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
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
