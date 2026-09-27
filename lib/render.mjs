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

/**
 * Ghép các đoạn. Chỗ nối sau đoạn bị cắt (joinIn/joinOut): mờ qua đen + hạ/nâng tiếng (fadeD giây)
 * và chèn SFX chuyển cảnh. Các chỗ nối không liền mạch khác: afade 20ms để không bị "click".
 */
function filterScript(l, segs, { fps, W, H, hasClean, sfxIdx, sfxVol = 0.45, fadeD = 0.25, sfxLead = 0.35 }) {
  const N = segs.length, rel = (t) => (t - l.start).toFixed(3), f = [];
  const aIn = hasClean ? "[1:a]" : "[0:a]";
  const mute = l.mute.map(([a, b]) => `volume=enable='between(t,${rel(a)},${rel(b)})':volume=0`).join(",");
  f.push(`[0:v]split=${N}${segs.map((_, k) => `[sv${k}]`).join("")};`);
  f.push(`${aIn}${mute ? mute + "," : ""}asplit=${N}${segs.map((_, k) => `[sa${k}]`).join("")};`);
  let t = 0;
  const joins = [];
  segs.forEach((g, k) => {
    const d = (g.e - g.s) / g.sp, fd = Math.min(fadeD, d / 3).toFixed(3);
    const contPrev = k > 0 && Math.abs(segs[k - 1].e - g.s) < 0.02;
    const contNext = k < N - 1 && Math.abs(segs[k + 1].s - g.e) < 0.02;
    const vf = [], af = [];
    if (g.joinIn) { vf.push(`fade=t=in:st=0:d=${fd}`); af.push(`afade=t=in:st=0:d=${fd}`); joins.push(t); }
    else if (k > 0 && !contPrev) af.push("afade=t=in:st=0:d=0.02");
    if (g.joinOut) { vf.push(`fade=t=out:st=${(d - fd).toFixed(3)}:d=${fd}`); af.push(`afade=t=out:st=${(d - fd).toFixed(3)}:d=${fd}`); }
    else if (k < N - 1 && !contNext) af.push(`afade=t=out:st=${Math.max(0, d - 0.02).toFixed(3)}:d=0.02`);
    const vx = vf.length ? "," + vf.join(",") : "", ax = af.length ? "," + af.join(",") : "";
    f.push(`[sv${k}]trim=${rel(g.s)}:${rel(g.e)},setpts=PTS-STARTPTS${g.sp === 1 ? "" : `,setpts=PTS/${g.sp}`}${vx}[v${k}];`);
    f.push(`[sa${k}]atrim=${rel(g.s)}:${rel(g.e)},asetpts=PTS-STARTPTS${g.sp === 1 ? "" : `,atempo=${g.sp}`}${ax}[a${k}];`);
    t += d;
  });
  f.push(`${segs.map((_, k) => `[v${k}][a${k}]`).join("")}concat=n=${N}:v=1:a=1[vc][ac];`);
  f.push(`[vc]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1,format=yuv420p[vout];`);
  if (sfxIdx !== undefined && joins.length) {
    const J = joins.length;
    f.push(`[${sfxIdx}:a]aformat=channel_layouts=stereo,aresample=48000,volume=${sfxVol},asplit=${J}${joins.map((_, i) => `[x${i}]`).join("")};`);
    joins.forEach((jt, i) => f.push(`[x${i}]adelay=${Math.round(Math.max(0, jt - sfxLead) * 1000)}:all=1[y${i}];`));
    f.push(`[ac]aformat=channel_layouts=stereo,aresample=48000[am];`);
    f.push(`[am]${joins.map((_, i) => `[y${i}]`).join("")}amix=inputs=${J + 1}:normalize=0:duration=first[aout]`);
  } else f.push(`[ac]aformat=channel_layouts=stereo,aresample=48000[aout]`);
  return { script: f.join("\n"), joins };
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
  const sfx = edl.sfx || {};
  const sfxCut = sfx.cut && existsSync(join(P.brand, sfx.cut)) ? join(P.brand, sfx.cut) : null;
  const sfxIntro = sfx.intro && existsSync(join(P.brand, sfx.intro)) ? join(P.brand, sfx.intro) : null;
  const sfxIdx = sfxCut ? (clean ? 2 : 1) : undefined;
  const fsr = filterScript(l, segs, { fps, W, H, hasClean: !!clean, sfxIdx, sfxVol: sfx.volume ?? 0.45, fadeD: edl.cutFade ?? 0.25 });
  writeText(fsFile, fsr.script);
  const introSec = noIntro ? 0 : edl.introSeconds || 4, xf = 0.5;
  writeJSON(P.p("out", "segmaps", `${l.code}.json`), { code: l.code, contentOffset: noIntro ? 0 : introSec - xf, segs });

  const dur = (l.end - l.start).toFixed(3);
  const inputs = ["-ss", String(l.start), "-t", dur, "-i", src];
  if (clean) inputs.push("-ss", String(l.start), "-t", dur, "-i", clean);
  if (sfxCut) inputs.push("-i", sfxCut);
  // crf 23 + preset slow: màn hình quay (chữ, UI) vẫn nét, dung lượng nhỏ hơn ~40% so với crf 20
  const enc = ["-c:v", "libx264", "-crf", String(edl.crf || 23), "-preset", edl.preset || "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000"];
  log(`  • cắt ${segs.length} đoạn (${segs.filter((g) => g.sp > 1).length} tua ${edl.rules.speed}x) · ${clock(l.end - l.start)} → ${clock(outDuration(segs))}${clean ? " · audio đã làm sạch" : ""}${fsr.joins.length ? ` · ${fsr.joins.length} chỗ cắt có chuyển cảnh${sfxCut ? " + SFX" : ""}` : ""}`);
  ffmpeg([...inputs, "-filter_complex_script", fsFile, "-map", "[vout]", "-map", "[aout]", ...enc, tmp("edited")]);

  const part = final + ".part.mp4";
  if (noIntro) {
    ffmpeg(["-i", tmp("edited"), "-c", "copy", "-movflags", "+faststart", part]);
  } else {
    log("  • intro Remotion…");
    renderIntro(P, edl, l, tmp("intro"), { fps, width: W, height: H });
    const fc = `[0:v]fps=${fps},format=yuv420p,setsar=1[iv];[1:v]fps=${fps},format=yuv420p,setsar=1[lv];` +
      `[iv][lv]xfade=transition=fade:duration=${xf}:offset=${introSec - xf}[v];` +
      `[2:a]atrim=0:${introSec},asetpts=PTS-STARTPTS[ia];[ia][1:a]acrossfade=d=${xf}[a0];` +
      (sfxIntro
        ? `[3:a]aformat=channel_layouts=stereo,aresample=48000,volume=${sfx.volume ?? 0.45},adelay=${Math.round(Math.max(0, introSec - xf - 0.4) * 1000)}:all=1[s];[a0][s]amix=inputs=2:normalize=0:duration=first[a]`
        : `[a0]anull[a]`);
    const extra = sfxIntro ? ["-i", sfxIntro] : [];
    ffmpeg(["-i", tmp("intro"), "-i", tmp("edited"), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", ...extra, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", ...enc, "-movflags", "+faststart", part]);
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
