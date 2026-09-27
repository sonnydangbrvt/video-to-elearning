// `v2e qa`: kiểm tra từng file out/final (thời lượng, âm lượng, lệch tiếng/hình, khung đen, đứng hình).
import { existsSync } from "node:fs";
import { loadCues, loadEdl, loadSilences, outDuration, segmentsFor } from "./edl.mjs";
import { clock, log, project, readJSON, run, writeText } from "./util.mjs";

function inspect(file) {
  const pr = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration:format=duration", "-of", "json", file]).out);
  const vd = +pr.streams.find((s) => s.codec_type === "video")?.duration;
  const ad = +pr.streams.find((s) => s.codec_type === "audio")?.duration;
  const r = run("ffmpeg", ["-hide_banner", "-i", file, "-filter_complex",
    "[0:v]crop=iw*0.6:ih*0.6,scale=320:-2,blackdetect=d=3:pix_th=0.06,freezedetect=n=0.003:d=60[vo];[0:a]ebur128=peak=true[ao]",
    "-map", "[vo]", "-map", "[ao]", "-f", "null", "-"], { allowFail: true }).err;
  const sum = r.slice(r.lastIndexOf("Summary:"));
  return {
    dur: +pr.format.duration, vd, ad,
    I: parseFloat((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]),
    TP: parseFloat((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]),
    black: [...r.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]),
    freeze: [...r.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]),
    decodeErrors: /error|corrupt/i.test(r.split("Summary:")[0].replace(/blackdetect|freezedetect|ebur128/g, "")) ? 1 : 0,
  };
}

export function qa(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  const cues = loadCues(P);
  const sil = loadSilences(P);
  let list = edl.lessons;
  if (args.only) { const only = String(args.only).split(","); list = list.filter((l) => only.includes(l.code)); }
  const rows = [];
  let fails = 0;
  for (const l of list) {
    const f = P.p("out", "final", l.file);
    if (!existsSync(f)) { rows.push(`| ${l.code} | ❌ chưa render | | | | |`); fails++; continue; }
    log(`• QA ${l.code}…`);
    const x = inspect(f);
    const sm = readJSON(P.p("out", "segmaps", `${l.code}.json`), null);
    const expect = sm?.expectedDur ?? (sm?.contentOffset ?? 0) + outDuration(sm?.segs || segmentsFor(edl, sil, l));
    const issues = [];
    if (Math.abs(x.dur - expect) > 2) issues.push(`thời lượng ${clock(x.dur)} ≠ dự kiến ${clock(expect)}`);
    if (!(x.I > -17.5 && x.I < -14.5)) issues.push(`âm lượng ${x.I} LUFS (chuẩn -16±1.5)`);
    if (x.TP > -0.5) issues.push(`đỉnh ${x.TP} dBFS (dễ vỡ tiếng)`);
    if (Math.abs(x.vd - x.ad) > 0.15) issues.push(`lệch audio/video ${(x.vd - x.ad).toFixed(2)}s`);
    x.black.filter(([a]) => a > 1).forEach(([a, b]) => issues.push(`khung đen ${clock(a)}–${clock(b)}`));
    x.freeze.forEach((a) => issues.push(`đứng hình ≥60s tại ${clock(a)} (kiểm tra: có thể là màn hình tĩnh hợp lệ)`));
    if (x.decodeErrors) issues.push("lỗi giải mã");
    const hard = issues.filter((s) => !s.startsWith("đứng hình"));
    if (hard.length) fails++;
    rows.push(`| ${l.code} | ${hard.length ? "❌" : issues.length ? "⚠️" : "✅"} | ${clock(x.dur)} | ${x.I} | ${x.TP} | ${issues.join("; ") || "—"} |`);
  }
  const md = `# QA report\n\n| Bài | KQ | Thời lượng | LUFS | Peak dBFS | Ghi chú |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\n` +
    `Chuẩn: -16 ±1.5 LUFS · peak ≤ -0.5 dBFS · lệch A/V < 0.15s · thời lượng khớp EDL ±2s.\n` +
    `Ngoài phần tự động, người duyệt nên xem: 10s đầu mỗi bài (intro→bài), 3 điểm cắt ngẫu nhiên, và toàn bộ out/review-mistakes/.\n`;
  writeText(P.p("out", "qa-report.md"), md);
  log(`\n${md}`);
  log(fails ? `✗ ${fails} bài có lỗi — xem out/qa-report.md` : "✔ QA đạt. Bước tiếp: v2e export");
  if (fails) process.exitCode = 1;
}
