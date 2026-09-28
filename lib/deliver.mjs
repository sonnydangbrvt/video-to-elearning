// `v2e deliver`: gói bàn giao cho agent/website e-learning.
//   deliver <dir> --prepare  → work/lesson-text/<MÃ>.txt (transcript phần được GIỮ của từng bài) để Claude soạn
//                              work/lesson-content/<MÃ>.json (summary, objectives, checklist, keyTerms, tools, practice)
//   deliver <dir>            → out/delivery/course.json (máy đọc) + course.md (người đọc) + lessons.csv (import)
// Nền tảng lưu trữ video là "host" cắm thêm được: đọc out/<host>/state.json (youtube hôm nay; bunny/vimeo… sau này
// chỉ cần ghi state.json cùng dạng { videos: { <MÃ>: { id, url, privacy } }, playlistId? }).
import { existsSync } from "node:fs";
import { loadCues, loadEdl } from "./edl.mjs";
import { clock, log, probeDuration, project, readJSON, writeJSON, writeText } from "./util.mjs";

const HOSTS = {
  youtube: {
    video: (v) => ({ provider: "youtube", id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, shortUrl: v.url, embedUrl: `https://www.youtube.com/embed/${v.id}`, thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`, privacy: v.privacy }),
    playlist: (s) => (s.playlistId ? { provider: "youtube", id: s.playlistId, url: `https://www.youtube.com/playlist?list=${s.playlistId}` } : null),
  },
  mux: {
    video: (v) => ({
      provider: "mux", id: v.id, playbackId: v.playbackId, url: `https://player.mux.com/${v.playbackId}`, embedUrl: `https://player.mux.com/${v.playbackId}`,
      hlsUrl: `https://stream.mux.com/${v.playbackId}.m3u8`, thumbnailUrl: `https://image.mux.com/${v.playbackId}/thumbnail.jpg`,
      privacy: v.privacy, requiresToken: v.privacy === "signed",
    }),
    playlist: () => null,
  },
  // bunny/vimeo…: thêm 1 mục cùng dạng + uploader ghi out/<host>/state.json
};

function prepare(P, edl) {
  const cues = loadCues(P) || [];
  const drops = edl.mistakes.filter((m) => m.drop).map((m) => [m.start, m.end]);
  for (const l of edl.lessons) {
    const d = [...drops, ...l.drops];
    const keep = cues.filter((c) => c.end > l.start && c.start < l.end && !c.h && !d.some(([a, b]) => c.start >= a - 0.5 && c.end <= b + 0.5));
    writeText(P.p("work", "lesson-text", `${l.code}.txt`),
      `# ${l.code} — ${l.title.replace(/\*\*/g, "")}\n# Phần: ${edl.parts?.[l.part] || ""}\n# Ý chính (PLAN): ${(l.bullets || []).join("; ")}\n\n${keep.map((c) => c.text).join(" ")}\n`);
  }
  log(`✔ work/lesson-text/*.txt (${edl.lessons.length} bài)
Tiếp theo (Claude): với mỗi bài đọc lesson-text/<MÃ>.txt, ghi work/lesson-content/<MÃ>.json:
  { code, summary (2–4 câu), objectives[3], checklist[4–7 theo thứ tự trong video], keyTerms[], tools[], level, practice }
  — chỉ điều có trong transcript; sửa thuật ngữ nghe nhầm; không nhắc bán hàng. Nhiều bài → chia cho sub-agent song song.
Rồi chạy: v2e deliver <dir>`);
}

export function deliver(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  if (args.prepare) return prepare(P, edl);

  // host: ưu tiên --host, không thì host đầu tiên có state.json
  const available = Object.keys(HOSTS).filter((h) => existsSync(P.p("out", h, "state.json")));
  const states = Object.fromEntries(available.map((h) => [h, readJSON(P.p("out", h, "state.json"), { videos: {} })]));
  const hostName = args.host || available[0];
  if (args.host && !available.includes(args.host)) throw new Error(`Chưa có out/${args.host}/state.json`);
  const host = hostName ? HOSTS[hostName] : null;
  const hstate = hostName ? states[hostName] : { videos: {} };
  const courseTitle = edl.youtube?.courseName || edl.course;

  const lessons = edl.lessons.map((l) => {
    const file = P.p("out", "final", l.file);
    const sec = existsSync(file) ? Math.round(probeDuration(file)) : null;
    const content = readJSON(P.p("work", "lesson-content", `${l.code}.json`), {});
    const hv = hstate.videos[l.code];
    const srt = P.p("out", "captions", l.file.replace(/\.mp4$/, ".srt"));
    const thumb = P.p("out", "thumb", `${String(l.index).padStart(2, "0")}-${l.code}.png`);
    return {
      order: l.index,
      code: l.code,
      part: { code: l.part, title: (edl.parts?.[l.part] || "").replace(/^PHẦN [A-Z]+ · /, ""), label: edl.parts?.[l.part] || "" },
      title: l.title.replace(/\*\*/g, ""),
      platformTitle: hv?.title || null,
      isBonus: !!l.bonus,
      duration: sec !== null ? clock(sec) : null,
      durationSec: sec,
      summary: content.summary || "",
      objectives: content.objectives || [],
      checklist: content.checklist || (l.bullets || []),
      keyTerms: content.keyTerms || [],
      tools: content.tools || [],
      practice: content.practice || "",
      level: content.level || edl.level || "",
      // host chính; bài chưa có trên host chính → lấy từ host khác (ghi rõ provider)
      video: hv && host ? host.video(hv) : (() => { const h = available.find((x) => states[x].videos[l.code]); return h ? HOSTS[h].video(states[h].videos[l.code]) : null; })(),
      hosts: Object.fromEntries(available.filter((h) => states[h].videos[l.code]).map((h) => [h, HOSTS[h].video(states[h].videos[l.code])])),
      files: { video: existsSync(file) ? file : null, thumbnail: existsSync(thumb) ? thumb : null, captions: existsSync(srt) ? srt : null },
      source: { range: `${clock(l.start)}–${clock(l.end)}` },
    };
  });

  const total = lessons.reduce((n, x) => n + (x.durationSec || 0), 0);
  const parts = [...new Set(lessons.map((x) => x.part.code))].map((c) => {
    const ls = lessons.filter((x) => x.part.code === c);
    const s = ls.reduce((n, x) => n + (x.durationSec || 0), 0);
    return { code: c, title: ls[0].part.title, label: ls[0].part.label, lessonCount: ls.length, duration: clock(s), durationSec: s, lessons: ls.map((x) => x.code) };
  });
  const missing = {
    video: lessons.filter((x) => !x.video).map((x) => x.code),
    content: lessons.filter((x) => !x.summary).map((x) => x.code),
  };
  const course = {
    schema: "v2e.delivery/1",
    generatedAt: new Date().toISOString(),
    course: {
      title: courseTitle,
      level: edl.level || lessons[0]?.level || "",
      language: edl.youtube?.language || "vi",
      lessonCount: lessons.length,
      duration: clock(total),
      durationSec: total,
      host: hostName || null,
      hostsAvailable: available,
      playlist: host ? host.playlist(hstate) : null,
      parts,
    },
    lessons,
    missing,
  };
  writeJSON(P.p("out", "delivery", "course.json"), course);

  // Bản người đọc
  let md = `# ${courseTitle}\n\n- ${lessons.length} bài · tổng **${clock(total)}**${course.course.playlist ? ` · Playlist: ${course.course.playlist.url}` : ""}\n- File máy đọc cho agent: \`out/delivery/course.json\` (schema v2e.delivery/1) · import bảng: \`out/delivery/lessons.csv\`\n\n`;
  for (const p of parts) {
    md += `## ${p.label || p.code} — ${p.lessonCount} bài · ${p.duration}\n\n`;
    for (const x of lessons.filter((y) => y.part.code === p.code)) {
      md += `### ${String(x.order).padStart(2, "0")}. ${x.title}${x.isBonus ? " (Bonus)" : ""}\n\n`;
      md += `- Thời lượng: **${x.duration ?? "?"}**${x.video ? ` · Link: ${x.video.url}` : " · ⚠️ chưa đăng"}\n`;
      if (x.summary) md += `\n${x.summary}\n`;
      if (x.objectives.length) md += `\n**Mục tiêu:**\n${x.objectives.map((o) => `- ${o}`).join("\n")}\n`;
      if (x.checklist.length) md += `\n**Nội dung:**\n${x.checklist.map((o) => `- [ ] ${o}`).join("\n")}\n`;
      if (x.keyTerms.length) md += `\n**Thuật ngữ:** ${x.keyTerms.join(", ")}\n`;
      if (x.practice) md += `\n**Thực hành:** ${x.practice}\n`;
      md += "\n";
    }
  }
  writeText(P.p("out", "delivery", "course.md"), md);

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = ["order", "code", "part", "title", "duration", "durationSec", "url", "embedUrl", "summary", "objectives", "checklist", "keyTerms", "tools", "practice", "isBonus"];
  const rows = lessons.map((x) => [x.order, x.code, x.part.label, x.title, x.duration, x.durationSec, x.video?.url, x.video?.embedUrl, x.summary, x.objectives.join(" | "), x.checklist.join(" | "), x.keyTerms.join(", "), x.tools.join(", "), x.practice, x.isBonus]);
  writeText(P.p("out", "delivery", "lessons.csv"), "﻿" + [cols.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n");

  log(`✔ out/delivery/course.json · course.md · lessons.csv
  ${lessons.length} bài · ${clock(total)} · host: ${hostName || "chưa có"}${missing.video.length ? ` · ⚠️ chưa đăng: ${missing.video.join(",")}` : ""}${missing.content.length ? ` · ⚠️ thiếu nội dung: ${missing.content.join(",")}` : ""}`);
}
