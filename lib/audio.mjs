// `v2e clean-audio`: khử ồn + lọc ù + chống xì + nén + chuẩn hoá -16 LUFS (2 lượt).
// Chạy 1 lần trên toàn bộ nguồn → work/audio-clean.m4a (cùng timeline với video gốc).
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectSilences } from "./prepare.mjs";
import { clock, ensureDirs, ffmpeg, log, probeDuration, project, run, writeJSON } from "./util.mjs";

export const PRESETS = {
  light: "highpass=f=70,afftdn=nr=8:nf=-35",
  standard: "highpass=f=80,lowpass=f=12000,afftdn=nr=12:nf=-30:tn=1,deesser=i=0.3,acompressor=threshold=-20dB:ratio=3:attack=5:release=120",
  strong: "highpass=f=100,lowpass=f=10000,afftdn=nr=20:nf=-25:tn=1,agate=threshold=0.015:ratio=2:attack=5:release=250,deesser=i=0.4,acompressor=threshold=-22dB:ratio=4:attack=5:release=150",
};
const TARGET = "I=-16:TP=-1.5:LRA=11";

function measure(src, chain, ss, t) {
  const pre = ss !== undefined ? ["-ss", String(ss), "-t", String(t)] : [];
  const r = run("ffmpeg", ["-hide_banner", ...pre, "-i", src, "-vn", "-af", `${chain},loudnorm=${TARGET}:print_format=json`, "-f", "null", "-"]).err;
  return JSON.parse(r.slice(r.lastIndexOf("{"), r.lastIndexOf("}") + 1));
}
const second = (m) => `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;

export function cleanAudio(args) {
  const P = project(args._[0]);
  const src = P.source();
  const preset = args.preset || "standard";
  const chain = args.filter || PRESETS[preset];
  if (!chain) throw new Error(`Preset không hợp lệ: ${preset} (light|standard|strong)`);

  if (args.sample) {
    // 3 đoạn 30s: trước / sau, để người dùng nghe so sánh
    const dur = probeDuration(src);
    const at = args.at ? String(args.at).split(",").map(Number) : [0.1, 0.5, 0.85].map((f) => Math.round(dur * f));
    const dir = P.p("work", "audio-samples");
    ensureDirs(dir);
    for (const t of at) {
      const tag = clock(t).replace(/:/g, "");
      ffmpeg(["-ss", String(t), "-t", "30", "-i", src, "-vn", "-ac", "2", "-ar", "48000", join(dir, `${tag}-truoc.wav`)]);
      const m = measure(src, chain, t, 30);
      ffmpeg(["-ss", String(t), "-t", "30", "-i", src, "-vn", "-af", `${chain},${second(m)}`, "-ac", "2", "-ar", "48000", join(dir, `${tag}-sau-${preset}.wav`)]);
      log(`• ${clock(t)} → work/audio-samples/${tag}-truoc.wav  vs  ${tag}-sau-${preset}.wav`);
    }
    log("Nghe thử rồi chọn preset: light (ít ồn) · standard (mặc định) · strong (quạt/máy lạnh to).");
    return;
  }

  const out = P.p("work", "audio-clean.m4a");
  const mid = P.p("work", "_filtered.flac");
  // Bộ lọc nặng (afftdn) chỉ chạy 1 lần → FLAC mono lossless; 2 lượt loudnorm chạy trên file đó (nhanh)
  log(`• Lượt 1/3: lọc ồn toàn bộ (${preset})…`);
  ffmpeg(["-i", src, "-vn", "-af", chain, "-ac", "1", "-ar", "48000", "-c:a", "flac", mid]);
  log("• Lượt 2/3: đo độ to…");
  const m = measure(mid, "anull");
  log(`  trước chuẩn hoá: ${m.input_i} LUFS · đỉnh ${m.input_tp} dBTP`);
  log("• Lượt 3/3: chuẩn hoá -16 LUFS…");
  ffmpeg(["-i", mid, "-af", second(m), "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", out]);
  rmSync(mid);
  const check = measure(out, "anull");
  writeJSON(P.p("work", "audio-clean.json"), { preset, chain, before: m, after: { I: check.input_i, TP: check.input_tp, LRA: check.input_lra }, at: new Date().toISOString() });
  // dò lại khoảng lặng trên audio sạch (nền ồn đã giảm → phát hiện chỗ ngắt hơi chính xác hơn)
  const sil = detectSilences(out, check, args["silence-db"]);
  writeJSON(P.p("work", "silences.clean.json"), sil);
  log(`✔ work/audio-clean.m4a · ${check.input_i} LUFS · đỉnh ${check.input_tp} dBTP · ${sil.silences.filter((x) => x.dur >= 2.5).length} khoảng lặng ≥2.5s
  Render sẽ tự dùng audio sạch + khoảng lặng mới. Khoảng lặng đã đổi → chạy lại \`v2e edl <dir> --snap\`.`);
}

export const cleanAudioPath = (P) => {
  const f = P.p("work", "audio-clean.m4a");
  return existsSync(f) ? f : null;
};
