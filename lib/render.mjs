// `v2e render`: cắt từng bài theo edl.json (1x / 2x / bỏ), ghép intro Remotion, xuất clip lỗi để duyệt.
import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { cleanAudioPath } from "./audio.mjs";
import { loadCues, loadEdl, loadSilences, outDuration, segmentsFor } from "./edl.mjs";
import { renderIntro } from "./remotion.mjs";
import { clock, ensureDirs, ffmpeg, log, project, readJSON, writeJSON, writeText } from "./util.mjs";

/** fps đầu ra: edl.fps, hoặc fps nguồn (tối đa 30) */
export function outFps(P, edl) {
  if (edl.fps) return edl.fps;
  const v = readJSON(P.p("work", "media.json"), { streams: [] }).streams.find((s) => s.codec_type === "video");
  if (!v) return 30;
  const [a, b] = v.r_frame_rate.split("/").map(Number);
  const f = Math.round(a / (b || 1));
  return f > 30 ? 30 : f || 30;
}

function filterScript(l, segs, { fps, W, H, hasClean }) {
  const N = segs.length, rel = (t) => (t - l.start).toFixed(3), f = [];
  const aIn = hasClean ? "[1:a]" : "[0:a]";
  const mute = l.mute.map(([a, b]) => `volume=enable='between(t,${rel(a)},${rel(b)})':volume=0`).join(",");
  f.push(`[0:v]split=${N}${segs.map((_, k) => `[sv${k}]`).join("")};`);
  f.push(`${aIn}${mute ? mute + "," : ""}asplit=${N}${segs.map((_, k) => `[sa${k}]`).join("")};`);
  segs.forEach((g, k) => {
    f.push(`[sv${k}]trim=${rel(g.s)}:${rel(g.e)},setpts=PTS-STARTPTS${g.sp === 1 ? "" : `,setpts=PTS/${g.sp}`}[v${k}];`);
    f.push(`[sa${k}]atrim=${rel(g.s)}:${rel(g.e)},asetpts=PTS-STARTPTS${g.sp === 1 ? "" : `,atempo=${g.sp}`}[a${k}];`);
  });
  f.push(`${segs.map((_, k) => `[v${k}][a${k}]`).join("")}concat=n=${N}:v=1:a=1[vc][ac];`);
  f.push(`[vc]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1,format=yuv420p[vout];`);
  f.push(`[ac]aformat=channel_layouts=stereo,aresample=48000[aout]`);
  return f.join("\n");
}

function renderLesson(P, edl, sil, l, { outDir, force, noIntro }) {
  const fps = outFps(P, edl), W = edl.width || 1920, H = edl.height || 1080;
  const final = join(outDir, l.file);
  if (existsSync(final) && !force) { log(`  ↷ ${l.code} đã có — bỏ qua (--force để làm lại)`); return final; }
  const src = P.source();
  const clean = cleanAudioPath(P);
  const segs = segmentsFor(edl, sil, l);
  const tmp = (x) => P.p("out", x, `${l.code}.mp4`);
  ensureDirs(P.p("out", "edited"), P.p("out", "intro"), P.p("out", "filters"), P.p("out", "segmaps"));

  const fsFile = P.p("out", "filters", `${l.code}.txt`);
  writeText(fsFile, filterScript(l, segs, { fps, W, H, hasClean: !!clean }));
  const introSec = noIntro ? 0 : edl.introSeconds || 4, xf = 0.5;
  writeJSON(P.p("out", "segmaps", `${l.code}.json`), { code: l.code, contentOffset: noIntro ? 0 : introSec - xf, segs });

  const dur = (l.end - l.start).toFixed(3);
  const inputs = ["-ss", String(l.start), "-t", dur, "-i", src];
  if (clean) inputs.push("-ss", String(l.start), "-t", dur, "-i", clean);
  const enc = ["-c:v", "libx264", "-crf", String(edl.crf || 20), "-preset", edl.preset || "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000"];
  log(`  • cắt ${segs.length} đoạn (${segs.filter((g) => g.sp > 1).length} tua ${edl.rules.speed}x) · ${clock(l.end - l.start)} → ${clock(outDuration(segs))}${clean ? " · audio đã làm sạch" : ""}`);
  ffmpeg([...inputs, "-filter_complex_script", fsFile, "-map", "[vout]", "-map", "[aout]", ...enc, tmp("edited")]);

  const part = final + ".part.mp4";
  if (noIntro) {
    ffmpeg(["-i", tmp("edited"), "-c", "copy", "-movflags", "+faststart", part]);
  } else {
    log("  • intro Remotion…");
    renderIntro(P, edl, l, tmp("intro"), { fps, width: W, height: H });
    const fc = `[0:v]fps=${fps},format=yuv420p,setsar=1[iv];[1:v]fps=${fps},format=yuv420p,setsar=1[lv];` +
      `[iv][lv]xfade=transition=fade:duration=${xf}:offset=${introSec - xf}[v];` +
      `[2:a]atrim=0:${introSec},asetpts=PTS-STARTPTS[ia];[ia][1:a]acrossfade=d=${xf}[a]`;
    ffmpeg(["-i", tmp("intro"), "-i", tmp("edited"), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", fc, "-map", "[v]", "-map", "[a]", ...enc, "-movflags", "+faststart", part]);
  }
  renameSync(part, final);
  log(`  ✔ ${l.file}`);
  return final;
}

function exportMistakes(P, edl) {
  const src = P.source();
  const dir = P.p("out", "review-mistakes");
  ensureDirs(dir);
  for (const m of edl.mistakes) {
    const a = Math.max(0, m.start - 2), b = m.end + 2;
    const f = join(dir, `${m.id}-${clock(m.start).replace(/:/g, "")}${m.drop ? "-BO" : "-GIU"}.mp4`);
    if (existsSync(f)) continue;
    ffmpeg(["-ss", String(a), "-t", (b - a).toFixed(2), "-i", src, "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", f]);
  }
  log(`✔ ${edl.mistakes.length} clip lỗi → out/review-mistakes/ (hậu tố -BO = đang bỏ, -GIU = đang giữ)`);
}

export function render(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  const cues = loadCues(P);
  const sil = loadSilences(P);
  if (!sil) log("⚠️ Chưa có work/silences.json → không tăng tốc khoảng lặng (chạy v2e prepare).");
  const noIntro = !!args["no-intro"];
  const force = !!args.force;

  if (args.mistakes) return exportMistakes(P, edl);

  if (args.sample !== undefined) {
    // bài mẫu: chỉ định mã, hoặc tự chọn bài có nhiều đoạn tua nhất
    let l = typeof args.sample === "string" ? edl.lessons.find((x) => x.code === args.sample) : null;
    if (!l) l = [...edl.lessons].sort((a, b) => segmentsFor(edl, sil, b).filter((g) => g.sp > 1).length - segmentsFor(edl, sil, a).filter((g) => g.sp > 1).length)[0];
    const dir = P.p("out", "sample");
    mkdirSync(dir, { recursive: true });
    log(`▶ Render BÀI MẪU ${l.code} — ${l.title}`);
    const f = renderLesson(P, edl, sil, l, { outDir: dir, force: true, noIntro });
    log(`\nXem thử: ${f}\nĐạt → v2e render "${args._[0]}" --all  ·  Chưa đạt → sửa rules/edl rồi render --sample lại.`);
    return;
  }

  let list = edl.lessons;
  if (args.only) { const only = String(args.only).split(","); list = list.filter((l) => only.includes(l.code)); }
  else if (!args.all) throw new Error("Chọn: --sample [MÃ] | --only A1,A2 | --all  (thêm --mistakes để xuất clip lỗi)");
  const outDir = P.p("out", "final");
  list.forEach((l, i) => {
    log(`[${i + 1}/${list.length}] ${l.code} — ${l.title}`);
    renderLesson(P, edl, sil, l, { outDir, force, noIntro });
  });
  if (args.all && edl.mistakes.length) exportMistakes(P, edl);
  log(`\n✔ Render xong ${list.length} bài → out/final/. Bước tiếp: v2e thumbs · v2e qa · v2e export`);
}
