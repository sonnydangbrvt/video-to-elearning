// `v2e init` + `v2e prepare`: tạo khung dự án, tách audio, đo lặng/độ to, lấy frame & mốc đổi cảnh.
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { REPO, clock, ensureDirs, ffmpeg, log, probeDuration, project, readJSON, run, writeJSON, writeText } from "./util.mjs";

export function init(args) {
  const dir = args._[0];
  if (!dir || !args.video) throw new Error("Dùng: v2e init <thư-mục-dự-án> --video <file> [--transcript <vtt|srt|txt|json>] [--zoom-json <file>] [--title \"...\"]");
  const P = project(dir);
  const video = resolve(args.video);
  if (!existsSync(video)) throw new Error(`Không thấy video: ${video}`);
  ensureDirs(P.input, P.work, join(P.brand, "thumb-bg"), ...["final", "thumb", "captions", "review-mistakes"].map((d) => join(P.out, d)));

  const link = join(P.input, "source" + extname(video).toLowerCase());
  if (!existsSync(link)) symlinkSync(video, link); // không copy file lớn
  let transcript = null;
  if (args.transcript) {
    const t = resolve(args.transcript);
    transcript = join(P.input, "transcript" + extname(t).toLowerCase());
    copyFileSync(t, transcript);
  }
  let zoom = null;
  if (args["zoom-json"]) {
    zoom = join(P.input, "zoom.json");
    copyFileSync(resolve(args["zoom-json"]), zoom);
  }
  for (const f of readdirSync(join(REPO, "assets", "brand"))) {
    if (!existsSync(join(P.brand, f))) copyFileSync(join(REPO, "assets", "brand", f), join(P.brand, f));
  }
  for (const [src, dst] of [["brief.template.md", "brief.md"], ["glossary.json", "work/glossary.json"]]) {
    if (!existsSync(P.p(dst))) copyFileSync(join(REPO, "templates", src), P.p(dst));
  }
  writeJSON(P.p("work", "project.json"), {
    title: args.title || basename(P.root),
    source: video,
    transcript,
    zoom,
    createdAt: new Date().toISOString(),
  });
  log(`✔ Đã tạo dự án: ${P.root}
  • input/source → ${video}${transcript ? `\n  • transcript: ${transcript}` : "\n  • chưa có transcript → sẽ chạy Whisper"}
  • Điền brief.md (tên khoá, buổi, độ dài bài…) rồi chạy: v2e prepare "${dir}"`);
}

/**
 * Dò mọi khoảng lặng ≥0.3s. Ngưỡng tự tính theo độ to của giọng (giọng nhỏ → ngưỡng thấp hơn).
 * Dùng cho: tua 2x / cắt khoảng chết, và "snap" ranh giới bài vào chỗ ngắt hơi.
 */
export function detectSilences(file, loud, forceDb) {
  const noiseDb = forceDb ? +forceDb : Math.round(Math.min(-28, Math.max(-45, parseFloat(loud.input_i) - 12)));
  const sd = run("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=0.3`, "-f", "null", "-"]).err;
  const silences = [];
  let cur = null;
  for (const ln of sd.split("\n")) {
    let m = ln.match(/silence_start: (-?[\d.]+)/);
    if (m) cur = { start: Math.max(0, +m[1]) };
    m = ln.match(/silence_end: ([\d.]+)/);
    if (m && cur) { cur.end = +m[1]; cur.dur = +(cur.end - cur.start).toFixed(3); silences.push(cur); cur = null; }
  }
  if (cur) { cur.end = probeDuration(file); cur.dur = +(cur.end - cur.start).toFixed(3); silences.push(cur); }
  return { noiseDb, source: file, silences };
}

export function prepare(args) {
  const P = project(args._[0]);
  const src = P.source();
  ensureDirs(join(P.work, "frames"));

  // 1. media info
  const media = JSON.parse(run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", src]).out);
  writeJSON(P.p("work", "media.json"), media);
  const dur = parseFloat(media.format.duration);
  const v = media.streams.find((s) => s.codec_type === "video");
  const a = media.streams.find((s) => s.codec_type === "audio");
  log(`• Video ${clock(dur)} · ${v?.width}×${v?.height} @ ${v?.r_frame_rate} · audio: ${a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : "KHÔNG CÓ"}`);
  if (!a) throw new Error("Video không có track âm thanh.");

  // 2. audio 16k mono cho whisper + phân tích
  const wav = P.p("work", "audio16k.wav");
  if (!existsSync(wav) || args.force) {
    log("• Tách audio 16kHz mono…");
    ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  }

  // 3. độ to
  // ebur128 nhanh hơn loudnorm nhiều lần (loudnorm nội suy lên 192kHz) — chỉ cần số đo
  const eb = run("ffmpeg", ["-hide_banner", "-i", wav, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]).err;
  const sum = eb.slice(eb.lastIndexOf("Summary:"));
  const num = (re) => (sum.match(re) || [])[1];
  const loud = { input_i: num(/I:\s+(-?[\d.]+) LUFS/), input_thresh: num(/Threshold:\s+(-?[\d.]+) LUFS/), input_lra: num(/LRA:\s+(-?[\d.]+) LU/), input_tp: num(/Peak:\s+(-?[\d.]+) dBFS/) };
  writeJSON(P.p("work", "loudness.json"), loud);
  log(`• Độ to: ${loud.input_i} LUFS · đỉnh ${loud.input_tp} dBTP · nền ồn ~${loud.input_thresh} LUFS`);

  // 4. khoảng lặng (nguồn sự thật để tua/cắt — chính xác hơn mốc Whisper)
  const sil = detectSilences(wav, loud, args["silence-db"]);
  writeJSON(P.p("work", "silences.json"), sil);
  const long = sil.silences.filter((s) => s.dur >= 2.5);
  const total = long.reduce((n, s) => n + s.dur, 0);
  log(`• Khoảng lặng (ngưỡng ${sil.noiseDb}dB): ${long.length} đoạn ≥2.5s, tổng ${clock(total)} (${((total / dur) * 100).toFixed(0)}%) · dài nhất ${clock(Math.max(0, ...long.map((s) => s.dur)))}`);
  if (long.length === 0) log("  ⚠️ Không thấy khoảng lặng dài — có thể nền ồn lớn. Sau clean-audio sẽ dò lại trên audio sạch.");

  // 5. frame mẫu + contact sheet (seek từng điểm → nhanh cả với video 4h)
  const every = args.every ? +args.every : Math.max(30, Math.round(dur / 120 / 10) * 10);
  const fdir = join(P.work, "frames");
  for (const f of readdirSync(fdir)) rmSync(join(fdir, f), { recursive: true });
  const times = [];
  for (let t = Math.min(5, dur / 2); t < dur; t += every) times.push(t);
  log(`• Lấy ${times.length} frame (mỗi ${every}s)…`);
  times.forEach((t, i) => ffmpeg(["-ss", t.toFixed(2), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", join(fdir, `f_${String(i + 1).padStart(4, "0")}.jpg`)], { allowFail: true }));
  ffmpeg(["-framerate", "1", "-i", join(fdir, "f_%04d.jpg"), "-vf", "tile=6x5:padding=4:color=white", join(fdir, "contact-sheet-%02d.jpg")], { allowFail: true });
  const index = times.map((t, i) => {
    const from = join(fdir, `f_${String(i + 1).padStart(4, "0")}.jpg`);
    const name = `t_${clock(t).replace(/:/g, "")}.jpg`;
    if (existsSync(from)) renameSync(from, join(fdir, name));
    return { t: +t.toFixed(2), clock: clock(t), file: `frames/${name}` };
  });
  writeJSON(join(fdir, "index.json"), { every, sheetsGrid: "6x5 (đọc trái→phải, trên→dưới)", frames: index });

  // 6. mốc đổi cảnh (chỉ giải mã keyframe → nhanh)
  if (!args["no-scenes"]) {
    log("• Dò mốc đổi cảnh…");
    const sc = run("ffmpeg", ["-hide_banner", "-skip_frame", "nokey", "-i", src, "-vf", "scale=320:-2,select='gt(scene,0.25)',showinfo", "-an", "-fps_mode", "vfr", "-f", "null", "-"], { allowFail: true }).err;
    const scenes = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2));
    writeJSON(P.p("work", "scenes.json"), scenes);
    log(`  ${scenes.length} mốc đổi cảnh`);
  }
  writeText(P.p("work", ".prepared"), new Date().toISOString());
  const meta = readJSON(P.p("work", "project.json"));
  log(`\n✔ prepare xong. Bước tiếp: v2e transcribe "${args._[0]}"${meta.transcript ? " (sẽ dùng transcript có sẵn)" : ""}`);
}
