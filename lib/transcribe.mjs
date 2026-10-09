// `v2e transcribe`: dùng transcript có sẵn (VTT/SRT/SBV YouTube/whisper JSON) hoặc chạy whisper.cpp (+VAD),
// rồi chuẩn hoá thành work/cues.json (mili-giây) + bymin.txt + flags (đoạn nghi vấn).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { clock, clockMs, config, ensureDirs, ffmpeg, log, parseTime, probeDuration, project, readJSON, run, writeJSON, writeText } from "./util.mjs";

const CHUNK = 1680; // 28 phút / chunk — chạy lại được từng phần

// ---------- parsers ----------
function parseSubs(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const body = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!body) continue;
    cues.push({ start: parseTime(a), end: parseTime(b), text: body });
  }
  return cues;
}

/** YouTube .sbv: "0:00:00.320,0:00:04.839\nlời…" — bỏ chú thích kiểu [hắng giọng] / [âm nhạc] */
function parseSbv(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
    const m = lines[0]?.match(/^(\d+:\d\d:\d\d(?:\.\d+)?),(\d+:\d\d:\d\d(?:\.\d+)?)$/);
    if (!m) continue;
    const body = lines.slice(1).join(" ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    if (body) cues.push({ start: parseTime(m[1]), end: parseTime(m[2]), text: body });
  }
  return cues;
}

function parseWhisperJSON(json, offset = 0) {
  return (json.transcription || [])
    .map((s) => ({ start: s.offsets.from / 1000 + offset, end: s.offsets.to / 1000 + offset, text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text);
}

/** Zoom VTT: "TÊN NGƯỜI NÓI: nội dung" */
function splitSpeaker(c) {
  const m = c.text.match(/^([^:]{2,40}?):\s+(.*)$/);
  if (m && !/\d{2}/.test(m[1]) && m[1].split(" ").length <= 5) return { ...c, speaker: m[1].trim(), text: m[2] };
  return c;
}

// ---------- flags ----------
const PATTERNS = {
  hallucination: /subscribe|đăng ký kênh|lalaschool|ghiền mì gõ|hãy like|cảm ơn các bạn đã theo dõi|nhớ bấm/i,
  fumble: /xin lỗi|sorry|so ri|sâu ri|nhầm|lộn|sai rồi|làm lại|quay lại|hơi rối|ôi giời|hơi lú|bị lỗi/i,
  waiting: /số (một|1|hai|2|ba|3)\b|bạn nào xong|nghe rõ (không|chưa|mình)|thấy màn hình (chưa|không)|chờ (nó |mình )?(một )?(tí|chút|xíu)|đợi (một )?(tí|chút)/i,
  sales: /học phí|ưu đãi|giảm giá|chuyển khoản|link đăng ký|khảo sát|chứng nhận|giá (gốc|chỉ)|combo|mã giảm/i,
};

function markHallucinations(cues) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const words = c.text.split(/\s+/).length;
    if (PATTERNS.hallucination.test(c.text)) c.h = true;
    if (c.end - c.start > 20 && words / (c.end - c.start) < 0.3) c.h = true;
  }
  // cùng một câu lặp ≥3 lần liên tiếp
  let run0 = 0;
  for (let i = 1; i <= cues.length; i++) {
    if (i < cues.length && norm(cues[i].text) === norm(cues[run0].text) && norm(cues[i].text)) continue;
    if (i - run0 >= 3) for (let k = run0; k < i; k++) cues[k].h = true;
    run0 = i;
  }
}

function buildFlags(P, cues) {
  const flags = [];
  for (const c of cues) {
    for (const [type, re] of Object.entries(PATTERNS)) {
      if (type === "hallucination") continue;
      const m = c.text.match(re);
      if (m) flags.push({ type, cue: c.id, start: c.start, end: c.end, match: m[0], text: c.text.slice(0, 140) });
    }
  }
  // gom các cue ảo giác liên tiếp thành một khoảng
  let h = null;
  for (const c of cues) {
    if (c.h) { if (h && c.start - h.end < 5) { h.end = c.end; h.cues[1] = c.id; } else { h && flags.push(h); h = { type: "hallucination", cues: [c.id, c.id], start: c.start, end: c.end, text: c.text.slice(0, 80) }; } }
  }
  h && flags.push(h);
  // khoảng chết dài: lấy từ âm thanh thật (silences.json), không từ mốc Whisper
  const sil = readJSON(P.p("work", "silences.json"), { silences: [] }).silences;
  for (const x of sil) if (x.dur >= 25) flags.push({ type: "dead-air", cue: "-", start: x.start, end: x.end, text: `${Math.round(x.dur)}s im lặng (chờ AI / học viên thực hành?)` });
  flags.sort((a, b) => a.start - b.start);
  writeJSON(P.p("work", "flags.json"), flags);
  const label = { fumble: "Nói nhầm / xin lỗi / làm lại", waiting: "Chờ / tương tác lớp", sales: "Bán hàng / khảo sát", hallucination: "Whisper ảo giác (thực tế là im lặng)", "dead-air": "Khoảng chết ≥25s" };
  let md = `# Đoạn nghi vấn (tự động) — cần Claude/người đọc xác nhận\n\n`;
  for (const [type, name] of Object.entries(label)) {
    const fs = flags.filter((f) => f.type === type);
    md += `## ${name} (${fs.length})\n\n`;
    if (!fs.length) { md += "_không có_\n\n"; continue; }
    md += `| Thời gian | Cue | Trích |\n|---|---|---|\n`;
    for (const f of fs) md += `| \`${clock(f.start)}–${clock(f.end)}\` | ${f.cues ? `#${f.cues[0]}→#${f.cues[1]}` : f.cue === "-" ? "—" : `#${f.cue}`} | ${f.match ? `**${f.match}** · ` : ""}${f.text.replace(/\|/g, "/")} |\n`;
    md += "\n";
  }
  writeText(P.p("work", "flags.md"), md);
  return flags;
}

// ---------- main ----------
export function transcribe(args) {
  const P = project(args._[0]);
  const meta = P.meta();
  const glossary = readJSON(P.p("work", "glossary.json"), { prompt: "", replace: {} });
  let raw;

  if (meta.transcript && !args.whisper && !/\.txt$/i.test(meta.transcript)) {
    log(`• Dùng transcript có sẵn: ${meta.transcript}`);
    const t = readFileSync(meta.transcript, "utf8");
    raw = meta.transcript.endsWith(".json") ? parseWhisperJSON(JSON.parse(t)) : /\.sbv$/i.test(meta.transcript) ? parseSbv(t) : parseSubs(t);
  } else {
    if (meta.transcript?.endsWith(".txt")) log("• Transcript .txt không có mốc thời gian → vẫn chạy Whisper (file .txt dùng làm tham khảo).");
    raw = runWhisper(P, args, glossary);
  }

  let cues = raw.map(splitSpeaker).sort((a, b) => a.start - b.start);
  // chuẩn hoá thuật ngữ nghe nhầm
  const reps = Object.entries(glossary.replace || {});
  cues = cues.map((c, i) => {
    let text = c.text;
    // chỉ thay nguyên từ: "Claw" → "Claude" nhưng "OpenClaw" giữ nguyên
    for (const [from, to] of reps) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu"), to);
    return { id: i + 1, start: +c.start.toFixed(3), end: +c.end.toFixed(3), ...(c.speaker ? { speaker: c.speaker } : {}), text, ...(text !== c.text ? { raw: c.text } : {}) };
  });
  markHallucinations(cues);
  writeJSON(P.p("work", "cues.json"), cues);

  const who = (c) => (c.speaker ? `${c.speaker}: ` : "");
  writeText(P.p("work", "cues.timed.txt"), cues.map((c) => `#${c.id} [${clockMs(c.start)}-${clockMs(c.end)}]${c.h ? " ⚠️ẢO-GIÁC" : ""} ${who(c)}${c.text}`).join("\n") + "\n");
  const byMin = new Map();
  let lastSpeaker = null;
  for (const c of cues) {
    if (c.h) continue;
    const k = Math.floor(c.start / 60);
    const tag = c.speaker && c.speaker !== lastSpeaker ? `【${c.speaker}】 ` : "";
    lastSpeaker = c.speaker || lastSpeaker;
    byMin.set(k, (byMin.get(k) || "") + `${tag}${c.text} `);
  }
  writeText(P.p("work", "bymin.txt"), [...byMin].map(([m, t]) => `[${clock(m * 60).slice(0, 5)}] ${t.trim()}`).join("\n") + "\n");

  const flags = buildFlags(P, cues);
  const count = (t) => flags.filter((f) => f.type === t).length;
  log(`✔ ${cues.length} câu · ${cues.filter((c) => c.h).length} câu ảo giác · cờ: ${count("fumble")} nhầm, ${count("waiting")} chờ, ${count("sales")} bán hàng, ${count("dead-air")} khoảng chết
  → work/cues.json · work/cues.timed.txt · work/bymin.txt · work/flags.md
  Bước tiếp: Claude đọc bymin.txt + flags.md + frames/contact-sheet-*.jpg → viết PLAN.md (mẫu templates/PLAN.template.md) → NGƯỜI DÙNG DUYỆT.`);
}

function runWhisper(P, args, glossary) {
  const cfg = config();
  if (!cfg.whisperModel || !existsSync(cfg.whisperModel)) throw new Error("Chưa có model Whisper. Chạy: v2e doctor --install");
  const wav = P.p("work", "audio16k.wav");
  if (!existsSync(wav)) throw new Error("Chưa có work/audio16k.wav — chạy v2e prepare trước.");
  const wdir = P.p("work", "whisper");
  ensureDirs(wdir);
  const dur = probeDuration(wav);
  const n = Math.ceil(dur / CHUNK);
  const useVad = !args["no-vad"] && cfg.vadModel && existsSync(cfg.vadModel);
  if (!useVad) log("⚠️  Chạy KHÔNG có VAD → dễ bị ảo giác trên đoạn im lặng (sẽ được gắn cờ).");
  const all = [];
  for (let i = 0; i < n; i++) {
    const base = join(wdir, `chunk_${String(i).padStart(3, "0")}`);
    if (!existsSync(base + ".json")) {
      log(`• Whisper chunk ${i + 1}/${n} (${clock(i * CHUNK)} → ${clock(Math.min(dur, (i + 1) * CHUNK))})…`);
      ffmpeg(["-ss", String(i * CHUNK), "-t", String(CHUNK), "-i", wav, "-c", "copy", base + ".wav"]);
      const a = ["-m", cfg.whisperModel, "-f", base + ".wav", "-l", args.lang || "vi", "-oj", "-osrt", "-of", base, "-pp", "false"];
      if (useVad) a.push("--vad", "-vm", cfg.vadModel);
      if (glossary.prompt) a.push("--prompt", glossary.prompt);
      run("whisper-cli", a);
    } else log(`• chunk ${i + 1}/${n} đã có — bỏ qua`);
    all.push(...parseWhisperJSON(JSON.parse(readFileSync(base + ".json", "utf8")), i * CHUNK));
  }
  if (!args["keep-chunks"]) for (const f of readdirSync(wdir)) if (f.endsWith(".wav")) run("rm", [join(wdir, f)]);
  return all;
}
