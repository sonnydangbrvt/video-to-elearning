// `v2e export`: curriculum.json/.csv (để đưa lên nền tảng khoá học) + phụ đề .srt từng bài
// (thời gian đã tính lại theo video sau cắt, gồm cả intro và đoạn tua 2x).
import { existsSync } from "node:fs";
import { loadCues, loadEdl, loadSilences, outDuration, segmentsFor } from "./edl.mjs";
import { clock, log, probeDuration, project, readJSON, srtTime, writeJSON, writeText } from "./util.mjs";

const MAX = 84; // ký tự / dòng phụ đề

/** Đổi thời điểm gốc → thời điểm trong video đã cắt; null nếu bị cắt mất */
function mapper(segs, offset) {
  let acc = offset;
  // segmap mới có sẵn g.out (đã trừ phần chồng lên nhau khi chuyển cảnh); bản cũ thì cộng dồn
  const table = segs.map((g) => { const r = { ...g, out: g.out !== undefined ? offset + g.out : acc }; acc += (g.e - g.s) / g.sp; return r; });
  return (t) => {
    for (const g of table) if (t >= g.s && t <= g.e) return g.out + (t - g.s) / g.sp;
    return null;
  };
}

function captionsFor(cues, segs, offset) {
  const map = mapper(segs, offset);
  const out = [];
  for (const c of cues) {
    if (c.h) continue;
    const pts = [];
    for (const g of segs) {
      const a = Math.max(c.start, g.s), b = Math.min(c.end, g.e);
      if (b > a) pts.push(map(a), map(b));
    }
    if (!pts.length) continue;
    const s = Math.min(...pts), e = Math.max(...pts);
    // tách câu dài thành nhiều dòng theo tỉ lệ độ dài
    const words = c.text.split(/\s+/), chunks = [];
    let cur = "";
    for (const w of words) { if ((cur + " " + w).trim().length > MAX && cur) { chunks.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
    if (cur) chunks.push(cur);
    const total = chunks.reduce((n, x) => n + x.length, 0);
    let t = s;
    for (const ch of chunks) { const d = ((e - s) * ch.length) / total; out.push({ s: t, e: t + d, text: ch }); t += d; }
  }
  return out;
}

export function exportAll(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  const cues = loadCues(P);
  const sil = loadSilences(P);
  const rows = [];
  for (const l of edl.lessons) {
    const sm = readJSON(P.p("out", "segmaps", `${l.code}.json`), null);
    const segs = sm?.segs || segmentsFor(edl, sil, l);
    const offset = sm?.contentOffset ?? (edl.introSeconds || 4) - 0.5;
    const video = P.p("out", "final", l.file);
    const thumb = P.p("out", "thumb", `${String(l.index).padStart(2, "0")}-${l.code}.png`);
    const dur = existsSync(video) ? probeDuration(video) : sm?.expectedDur ?? offset + outDuration(segs);
    if (cues) {
      const caps = captionsFor(cues, segs, offset);
      writeText(P.p("out", "captions", l.file.replace(/\.mp4$/, ".srt")), caps.map((c, i) => `${i + 1}\n${srtTime(c.s)} --> ${srtTime(c.e)}\n${c.text}\n`).join("\n"));
    }
    rows.push({
      order: l.index,
      partCode: l.part || "",
      partTitle: edl.parts?.[l.part] || "",
      code: l.code,
      title: l.title,
      description: l.description || (l.bullets || []).join(" · "),
      duration: clock(dur),
      durationSec: Math.round(dur),
      sourceRange: `${clock(l.start)}–${clock(l.end)}`,
      video: existsSync(video) ? video : null,
      thumbnail: existsSync(thumb) ? thumb : null,
      captions: cues ? P.p("out", "captions", l.file.replace(/\.mp4$/, ".srt")) : null,
      bonus: !!l.bonus,
    });
  }
  writeJSON(P.p("out", "curriculum.json"), { course: edl.course || P.meta().title, parts: edl.parts || {}, lessons: rows });
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = ["order", "partCode", "partTitle", "code", "title", "description", "duration", "sourceRange", "video", "thumbnail", "captions"];
  writeText(P.p("out", "curriculum.csv"), "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
  const total = rows.reduce((n, r) => n + r.durationSec, 0);
  log(`✔ out/curriculum.json · out/curriculum.csv · ${cues ? "out/captions/*.srt" : "(không có phụ đề — thiếu cues)"}
  ${rows.length} bài · tổng ${clock(total)} · ${rows.filter((r) => !r.video).length} bài chưa render · ${rows.filter((r) => !r.thumbnail).length} bài chưa có thumbnail`);
}
