// `v2e render`: cắt từng bài theo edl.json (1x / 2x / bỏ), ghép intro Remotion, xuất clip lỗi để duyệt.
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { cleanAudioPath } from "./audio.mjs";
import { loadCues, loadEdl, loadSilences, outDuration, segmentsFor } from "./edl.mjs";
import { bgLayout } from "./frame.mjs";
import { renderCallouts, renderIntro } from "./remotion.mjs";
import { REPO, clock, ensureDirs, ffmpeg, log, project, readJSON, run, writeJSON, writeText } from "./util.mjs";

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
 * Dựng filter cho 1 bài.
 * - Các đoạn liền nhau (1x / tua 2x / cắt khoảng lặng dài) ghép thành "chunk".
 * - Giữa 2 chunk (chỗ đã bỏ một đoạn nội dung) là CHUYỂN CẢNH thật: âm lượng giảm dần ở cuối chunk trước,
 *   hình trượt/mờ sang chunk sau (xfade), tiếng giao nhau (acrossfade) + SFX whoosh → người xem hiểu cảnh trước đã kết thúc.
 * - Nếu có khung (frame): video đặt vào vùng nội dung của cửa sổ macOS trên hình nền, thay cho viền đen.
 * Trả về { script, transitions, segsOut, total }.
 */
function filterScript(l, segs, o) {
  const { fps, W, H, idx, bg, sfxVol = 0.45 } = o;
  const T = { type: "fade", duration: 0.5, audioFadeOut: 0.8, audioFadeIn: 0.35, sfxLead: 0.25, ...(o.transition || {}) };
  const rel = (t) => (t - l.start).toFixed(3), f = [];
  const realIdx = segs.map((g, k) => (g.ext ? -1 : k)).filter((k) => k >= 0); // đoạn chèn lấy từ video ngoài, không từ nguồn
  const N = realIdx.length;
  const mute = l.mute.map(([a, b]) => `volume=enable='between(t,${rel(a)},${rel(b)})':volume=0`).join(",");
  const crop = bg?.crop;
  if (N) {
    f.push(`[${idx.v}:v]${crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : ""}split=${N}${realIdx.map((k) => `[sv${k}]`).join("")};`);
    f.push(`[${idx.a}:a]${mute ? mute + "," : ""}asplit=${N}${realIdx.map((k) => `[sa${k}]`).join("")};`);
  }

  // chia chunk tại các chỗ nối sau đoạn bị bỏ
  const chunks = [];
  segs.forEach((g, k) => { if (k === 0 || g.joinIn) chunks.push([]); chunks[chunks.length - 1].push(k); });
  // scale mỗi chunk về kích thước "inner" đã fit sẵn theo tỉ lệ; nền (đen hoặc hình nền) ghép ở bước cuối
  const fit = bg
    ? `scale=${bg.inner.w}:${bg.inner.h}:flags=lanczos`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;

  const segsOut = [];
  const lens = [];
  chunks.forEach((ks, c) => {
    let clen = 0;
    ks.forEach((k, i) => {
      const g = segs[k], d = (g.e - g.s) / g.sp;
      if (g.ext) {
        const x = g.ext, ss = x.ss || 0, until = x.audioUntil ?? x.dur;
        f.push(`[${x.idx}:v]trim=${ss}:${(ss + x.dur).toFixed(3)},setpts=PTS-STARTPTS,fps=${fps}[v${k}];`);
        if (until >= x.dur - 0.05) {
          // cả clip là lời → khử ồn + chuẩn âm lượng
          f.push(`[${x.idx}:a]atrim=${ss}:${(ss + x.dur).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,afftdn=nr=12:nf=-30,volume=${(x.gain ?? 0).toFixed(1)}dB[a${k}];`);
        } else {
          // phần có lời [0, until]: khử ồn + chuẩn −16 LUFS; phần sau (nhạc nền gốc của clip, không có lời): GIỮ NGUYÊN nhạc,
          // chỉ đưa về mức nhẹ vừa nghe (musicLufs), nối mượt bằng acrossfade 0.4s — KHÔNG tắt tiếng.
          f.push(`[${x.idx}:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[xa1_${k}][xa2_${k}];`);
          f.push(`[xa1_${k}]atrim=${ss}:${(ss + until + 0.4).toFixed(3)},asetpts=PTS-STARTPTS,highpass=f=80,afftdn=nr=12:nf=-30,volume=${(x.gain ?? 0).toFixed(1)}dB[xs_${k}];`);
          f.push(`[xa2_${k}]atrim=${(ss + until).toFixed(3)}:${(ss + x.dur).toFixed(3)},asetpts=PTS-STARTPTS,volume=${(x.mGain ?? 0).toFixed(1)}dB[xm_${k}];`);
          f.push(`[xs_${k}][xm_${k}]acrossfade=d=0.4:c1=tri:c2=tri,apad=whole_dur=${x.dur}[a${k}];`);
        }
        segsOut.push({ ...g, chunk: c, inChunk: clen });
        clen += d;
        return;
      }
      const contPrev = i > 0 && Math.abs(segs[k - 1].e - g.s) < 0.02;
      const contNext = i < ks.length - 1 && Math.abs(segs[k + 1].s - g.e) < 0.02;
      const af = [];
      if (i > 0 && !contPrev) af.push("afade=t=in:st=0:d=0.02");
      if (i < ks.length - 1 && !contNext) af.push(`afade=t=out:st=${Math.max(0, d - 0.02).toFixed(3)}:d=0.02`);
      f.push(`[sv${k}]trim=${rel(g.s)}:${rel(g.e)},setpts=PTS-STARTPTS${g.sp === 1 ? "" : `,setpts=PTS/${g.sp}`}[v${k}];`);
      f.push(`[sa${k}]atrim=${rel(g.s)}:${rel(g.e)},asetpts=PTS-STARTPTS${g.sp === 1 ? "" : `,atempo=${g.sp}`}${af.length ? "," + af.join(",") : ""}[a${k}];`);
      segsOut.push({ ...g, chunk: c, inChunk: clen });
      clen += d;
    });
    lens.push(clen);
    f.push(`${ks.map((k) => `[v${k}][a${k}]`).join("")}concat=n=${ks.length}:v=1:a=1[cv${c}][ca${c}];`);
    if (ks.length === 1 && segs[ks[0]].ext) {
      // video chèn khác tỉ lệ → giữ nguyên tỉ lệ, phần thừa là chính hình đó phóng to + làm mờ (không viền đen)
      const iw = bg ? bg.inner.w : W, ih = bg ? bg.inner.h : H;
      f.push(`[cv${c}]split[ex1_${c}][ex2_${c}];`);
      f.push(`[ex1_${c}]scale=${iw}:${ih}:force_original_aspect_ratio=increase:flags=lanczos,crop=${iw}:${ih},boxblur=24:3[exb_${c}];`);
      f.push(`[ex2_${c}]scale=${iw}:${ih}:force_original_aspect_ratio=decrease:flags=lanczos[exf_${c}];`);
      f.push(`[exb_${c}][exf_${c}]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p,setsar=1[pv${c}];`);
    } else f.push(`[cv${c}]${fit},fps=${fps},format=yuv420p,setsar=1[pv${c}];`);
    const af = [];
    if (c > 0) af.push(`afade=t=in:st=0:d=${Math.min(T.audioFadeIn, clen / 4).toFixed(3)}`);
    if (c < chunks.length - 1) { const d = Math.min(T.audioFadeOut, clen / 3); af.push(`afade=t=out:st=${(clen - d).toFixed(3)}:d=${d.toFixed(3)}`); }
    f.push(`[ca${c}]aformat=channel_layouts=stereo,aresample=48000${af.length ? "," + af.join(",") : ""}[pa${c}];`);
  });

  // nối các chunk bằng xfade/acrossfade
  const starts = [0];
  let vcur = "pv0", acur = "pa0", acc = lens[0];
  for (let c = 1; c < chunks.length; c++) {
    const D = Math.min(T.duration, lens[c - 1] / 3, lens[c] / 3);
    const offset = acc - D;
    f.push(`[${vcur}][pv${c}]xfade=transition=${T.type}:duration=${D.toFixed(3)}:offset=${offset.toFixed(3)}[xv${c}];`);
    f.push(`[${acur}][pa${c}]acrossfade=d=${D.toFixed(3)}:c1=tri:c2=tri[xa${c}];`);
    starts.push(offset);
    acc = offset + lens[c];
    vcur = `xv${c}`; acur = `xa${c}`;
  }
  const total = acc;
  segsOut.forEach((g) => { g.out = starts[g.chunk] + g.inChunk; });
  const transitions = starts.slice(1).map((t, i) => {
    const a = segs[chunks[i][chunks[i].length - 1]], b = segs[chunks[i + 1][0]];
    return { at: t, fromSrc: a.ext ? a.ext.to : a.e, toSrc: b.ext ? b.ext.from : b.s, ext: a.ext || b.ext || null };
  });

  // ghép nền: hình nền macOS (input lặp) làm nền, video overlay lên trên; shortest=1 dừng đúng khi video hết
  if (bg) {
    f.push(`[${idx.bg}:v]scale=${W}:${H}:flags=lanczos,fps=${fps},format=yuv420p,setsar=1[wall];`);
    f.push(`[wall][${vcur}]overlay=${bg.x}:${bg.y}:shortest=1,format=yuv420p[vbase];`);
  } else f.push(`[${vcur}]null[vbase];`);

  // Chữ chủ đề bên trái: thẻ PNG trong suốt, hiện (fade + trượt nhẹ từ trái) tại thời điểm đầu câu tương ứng.
  // Thời điểm nguồn → thời điểm trong video đã cắt qua bảng ánh xạ segsOut; chủ đề rơi vào đoạn bị cắt thì bỏ qua.
  const CO_DUR = o.calloutDur ?? 4.6, CO_X = o.calloutX ?? 36, CO_Y = o.calloutY ?? 770;
  const mapOut = (t) => { for (const g of segsOut) if (!g.ext && t >= g.s && t < g.e) return g.out + (t - g.s) / g.sp; return null; };
  const extOut = segsOut.filter((g) => g.ext);
  const placed = [];
  let lastEnd = -1;
  for (const co of o.callouts || []) {
    let t0 = co.insert !== undefined ? (extOut[co.insert] ? extOut[co.insert].out + (co.offset || 0) - 0.3 : null) : mapOut(co.at);
    if (t0 === null) continue;
    t0 = Math.max(t0 + 0.3, lastEnd + 0.4); // vào sau đầu câu một chút, không chồng thẻ trước
    if (t0 + CO_DUR > total - 0.8) continue;
    lastEnd = t0 + CO_DUR;
    placed.push({ ...co, t0 });
  }
  let vl = "vbase";
  placed.forEach((co, k) => {
    const t0 = co.t0.toFixed(3);
    f.push(`[${co.idx}:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=${(CO_DUR - 0.45).toFixed(2)}:d=0.45:alpha=1,setpts=PTS+${t0}/TB[co${k}];`);
    f.push(`[${vl}][co${k}]overlay=x='${CO_X}-(1-min(1,(t-${t0})/0.4))*70':y=${CO_Y}:enable='between(t,${t0},${(co.t0 + CO_DUR).toFixed(3)})':eof_action=pass[vc${k}];`);
    vl = `vc${k}`;
  });
  f.push(`[${vl}]null[vout];`);

  // SFX tại mỗi chuyển cảnh
  if (idx.sfx !== undefined && transitions.length) {
    const J = transitions.length;
    f.push(`[${idx.sfx}:a]aformat=channel_layouts=stereo,aresample=48000,volume=${sfxVol},asplit=${J}${transitions.map((_, i) => `[x${i}]`).join("")};`);
    transitions.forEach((tr, i) => f.push(`[x${i}]adelay=${Math.round(Math.max(0, tr.at - T.sfxLead) * 1000)}:all=1[y${i}];`));
    f.push(`[${acur}]${transitions.map((_, i) => `[y${i}]`).join("")}amix=inputs=${J + 1}:normalize=0:duration=first[amain];`);
  } else f.push(`[${acur}]anull[amain];`);
  // nhạc nền nhẹ dưới giọng (vòng lặp, vào/ra mềm); amix duration=first → kết thúc khi giọng hết
  if (o.bed) {
    f.push(`[${o.bed.idx}:a]aformat=channel_layouts=stereo,aresample=48000,volume=${o.bed.db}dB,afade=t=in:st=0:d=3,afade=t=out:st=${Math.max(0, total - 4).toFixed(2)}:d=4[bed];`);
    f.push(`[amain][bed]amix=inputs=2:normalize=0:duration=first[aout]`);
  } else f.push(`[amain]anull[aout]`);
  return { script: f.join("\n"), transitions, segsOut, total };
}

/** Lý do của 1 chuyển cảnh: các đoạn bỏ nằm giữa 2 chunk */
function reasonsFor(edl, l, fromSrc, toSrc) {
  const hit = edl.mistakes.filter((m) => m.drop && m.end > fromSrc - 0.5 && m.start < toSrc + 0.5).map((m) => `${m.id}${m.note ? ` (${m.note})` : ""}`);
  const d = [...l.drops, ...edl.drops].filter(([a, b]) => b > fromSrc - 0.5 && a < toSrc + 0.5).map(([a, b]) => `drop ${clock(a)}–${clock(b)}`);
  return [...hit, ...d].join("; ") || "đoạn bị bỏ";
}

function renderLesson(P, edl, sil, l, { outDir, force, noIntro, reassemble }) {
  const fps = outFps(P, edl), W = edl.width || 1920, H = edl.height || 1080;
  const final = join(outDir, l.file);
  if (existsSync(final) && !force) { log(`  ↷ ${l.code} đã có — bỏ qua (--force để làm lại)`); return final; }
  const src = P.source();
  const clean = cleanAudioPath(P);
  const segs = segmentsFor(edl, sil, l);
  const tmp = (x) => P.p("out", x, `${l.code}.mp4`);
  ensureDirs(P.p("out", "edited"), P.p("out", "intro"), P.p("out", "filters"), P.p("out", "segmaps"), P.p("out", "cutlog"));

  const sfx = edl.sfx || {};
  // SFX: ưu tiên file riêng của dự án (brand/sfx/…), không có thì dùng bản đi kèm repo (assets/sfx/…)
  const findSfx = (rel) => (rel ? [join(P.brand, rel), join(REPO, "assets", rel)].find((f) => existsSync(f)) || null : null);
  const sfxCut = findSfx(sfx.cut ?? "sfx/cut-woosh.wav");
  const sfxIntro = findSfx(sfx.intro ?? "sfx/intro-woosh.wav");
  if (sfx.cut && !sfxCut) log(`  ⚠️ không thấy SFX chuyển cảnh "${sfx.cut}" → chỗ cắt sẽ không có tiếng whoosh`);
  const bg = bgLayout(P, edl, l, W, H);

  const dur = (l.end - l.start).toFixed(3);
  const inputs = ["-ss", String(l.start), "-t", dur, "-i", src];
  const idx = { v: 0, a: 0 };
  let n = 1;
  if (clean) { inputs.push("-ss", String(l.start), "-t", dur, "-i", clean); idx.a = n++; }
  if (sfxCut) { inputs.push("-i", sfxCut); idx.sfx = n++; }
  if (bg) { inputs.push("-loop", "1", "-i", bg.wallpaper); idx.bg = n++; }

  // video chèn (thay một đoạn gốc): thêm input + đo âm lượng phần có lời để chuẩn về −16 LUFS
  (l.inserts || []).forEach((x) => {
    inputs.push("-i", x.file); x.idx = n++;
    const until = x.audioUntil ?? x.dur;
    const m = run("ffmpeg", ["-hide_banner", "-ss", String(x.ss || 0), "-t", String(until), "-i", x.file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { allowFail: true }).err;
    const lufs = parseFloat((m.slice(m.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
    x.gain = Number.isFinite(lufs) ? Math.max(-6, Math.min(14, -16 - lufs)) : 0;
    if (until < x.dur - 1) {
      const mm = run("ffmpeg", ["-hide_banner", "-ss", String((x.ss || 0) + until + 0.5), "-t", String(x.dur - until - 0.5), "-i", x.file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { allowFail: true }).err;
      const ml = parseFloat((mm.slice(mm.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
      x.mGain = Number.isFinite(ml) ? Math.max(-12, Math.min(18, (x.musicLufs ?? -24) - ml)) : 0;
    }
  });
  // chữ chủ đề (thẻ PNG) + nhạc nền
  const CO_DUR = 4.6;
  const coPngs = edl.callouts === false ? [] : renderCallouts(P, edl, l);
  const callouts = (l.callouts || []).map((c, i) => ({ at: c.at, insert: c.insert, offset: c.offset, png: coPngs[i] })).filter((c) => c.png && (c.insert !== undefined || (c.at >= l.start && c.at < l.end)));
  callouts.forEach((c) => { inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(CO_DUR), "-i", c.png); c.idx = n++; });
  // Nhạc nền dưới giọng nói: MẶC ĐỊNH TẮT (giảng viên đang nói thì không chèn nhạc). Chỉ bật khi edl.bed = {file, volume}.
  const bedRel = edl.bed && edl.bed !== false ? edl.bed.file ?? "music/bed.m4a" : null;
  const bedFile = bedRel ? [join(P.brand, bedRel), join(REPO, "assets", bedRel)].find((f) => existsSync(f)) : null;
  let bed = null;
  if (bedFile) { inputs.push("-stream_loop", "-1", "-i", bedFile); bed = { idx: n++, db: edl.bed?.volume ?? -3 }; }

  const fsr = filterScript(l, segs, { fps, W, H, idx, bg, sfxVol: sfx.volume ?? 0.45, transition: edl.transition, callouts, calloutDur: CO_DUR, bed });
  const fsFile = P.p("out", "filters", `${l.code}.txt`);
  writeText(fsFile, fsr.script);
  const introSec = noIntro ? 0 : edl.introSeconds || 4;
  // Mở đầu = THUMBNAIL ĐÃ DUYỆT của chính bài (out/thumb/NN-MÃ.png) → nối thẳng (concat, không mã hoá lại phần bài)
  const thumbPng = P.p("out", "thumb", `${String(l.index).padStart(2, "0")}-${l.code}.png`);
  const contentOffset = noIntro ? 0 : introSec;
  writeJSON(P.p("out", "segmaps", `${l.code}.json`), { code: l.code, contentOffset, expectedDur: contentOffset + fsr.total, segs: fsr.segsOut });

  // nhật ký chuyển cảnh: số thứ tự video + thời điểm trong video + lý do → để người duyệt chỉ đúng chỗ cần sửa
  const cuts = fsr.transitions.map((tr, i) => ({
    n: i + 1, video: l.index, code: l.code, file: l.file,
    at: clock(contentOffset + tr.at), atSec: +(contentOffset + tr.at).toFixed(2),
    removed: tr.ext ? `${clock(tr.ext.from)}–${clock(tr.ext.to)}` : `${clock(tr.fromSrc)}–${clock(tr.toSrc)}`,
    reason: tr.ext ? `Thay bằng video chèn: ${tr.ext.label || tr.ext.file.split("/").pop()}` : reasonsFor(edl, l, tr.fromSrc, tr.toSrc),
  }));
  writeJSON(P.p("out", "cutlog", `${l.code}.json`), cuts);

  // crf 23 + preset medium: màn hình quay (chữ, UI) vẫn nét, nhanh
  const enc = ["-c:v", "libx264", "-crf", String(edl.crf || 23), "-preset", edl.preset || "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-video_track_timescale", "12800"];
  log(`  • ${segs.length} đoạn (${segs.filter((g) => g.sp > 1).length} tua ${edl.rules.speed}x) · ${clock(l.end - l.start)} → ${clock(fsr.total)}${clean ? " · audio sạch" : ""}${bg ? " · nền macOS" : ""}${cuts.length ? ` · ${cuts.length} chuyển cảnh${sfxCut ? " + SFX" : ""}` : ""}`);
  if (reassemble && existsSync(tmp("edited"))) log("  • dùng lại phần bài đã render (--reassemble)");
  else ffmpeg([...inputs, "-filter_complex_script", fsFile, "-map", "[vout]", "-map", "[aout]", ...enc, tmp("edited")]);

  const part = final + ".part.mp4";
  if (noIntro) {
    ffmpeg(["-i", tmp("edited"), "-c", "copy", "-movflags", "+faststart", part]);
  } else {
    // dải màu (color_range) của đoạn mở đầu phải khớp phần bài để nối không mã hoá lại
    const range = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_range", "-of", "csv=p=0", tmp("edited")], { allowFail: true }).out.trim();
    const musicRel = edl.introMusic ?? "music/intro-music.m4a";
    const music = musicRel === false ? null : [join(P.brand, musicRel), join(REPO, "assets", musicRel)].find((f) => existsSync(f));
    const aIns = [...(music ? ["-i", music] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]), ...(sfxIntro ? ["-i", sfxIntro] : [])];
    const vIn = existsSync(thumbPng) ? ["-loop", "1", "-t", String(introSec), "-i", thumbPng] : null;
    if (!vIn) {
      log("  ⚠️ chưa có thumbnail → dùng intro Remotion (chạy v2e thumbs trước để mở đầu = thumbnail)");
      renderIntro(P, edl, l, tmp("intro-remotion"), { fps, width: W, height: H });
    }
    const v = vIn || ["-i", tmp("intro-remotion")];
    const vol = sfx.volume ?? 0.45;
    const fc = `[0:v]scale=${W}:${H}:flags=lanczos,fps=${fps},format=yuv420p,setsar=1,trim=0:${introSec},setpts=PTS-STARTPTS,` +
      `fade=t=in:st=0:d=0.3,fade=t=out:st=${introSec - 0.35}:d=0.35[v];` +
      `[1:a]aformat=channel_layouts=stereo,aresample=48000,apad,atrim=0:${introSec},asetpts=PTS-STARTPTS,afade=t=out:st=${introSec - 0.7}:d=0.7[m];` +
      (sfxIntro ? `[2:a]aformat=channel_layouts=stereo,aresample=48000,volume=${vol},adelay=${Math.round((introSec - 0.7) * 1000)}:all=1[s];[m][s]amix=inputs=2:normalize=0:duration=first[a]` : `[m]anull[a]`);
    ffmpeg([...v, ...aIns, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", ...enc, ...(range === "pc" ? ["-color_range", "pc"] : []), "-t", String(introSec), tmp("intro")]);
    const list = P.p("out", "intro", `${l.code}.concat.txt`);
    writeText(list, `file '${tmp("intro").replace(/'/g, "'\\''")}'\nfile '${tmp("edited").replace(/'/g, "'\\''")}'\n`);
    ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", part]);
  }
  renameSync(part, final);
  writeCutLog(P);
  log(`  ✔ ${l.file}`);
  return final;
}

/** Gộp nhật ký chuyển cảnh của mọi bài → out/cut-log.md + out/cut-log.csv */
export function writeCutLog(P) {
  const dir = P.p("out", "cutlog");
  if (!existsSync(dir)) return;
  const all = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => readJSON(join(dir, f), []));
  all.sort((a, b) => a.video - b.video || a.atSec - b.atSec);
  let md = `# Nhật ký chuyển cảnh (chỗ đã cắt bỏ nội dung)\n\nNói với Claude: "video 12, chuyển cảnh lúc 07:23 — giữ lại đoạn đó / cắt sớm hơn…".\n\n| Video | Mã | # | Thời điểm trong video | Đã bỏ (thời gian gốc) | Lý do |\n|---|---|---|---|---|---|\n`;
  for (const c of all) md += `| ${String(c.video).padStart(2, "0")} | ${c.code} | ${c.n} | \`${c.at}\` | ${c.removed} | ${c.reason.replace(/\|/g, "/")} |\n`;
  writeText(P.p("out", "cut-log.md"), md);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  writeText(P.p("out", "cut-log.csv"), "﻿video,code,n,at,removed,reason,file\n" + all.map((c) => [c.video, c.code, c.n, c.at, c.removed, c.reason, c.file].map(esc).join(",")).join("\n") + "\n");
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
    renderLesson(P, edl, sil, l, { outDir, force, noIntro, reassemble: !!args.reassemble });
  });
  if (args.all && edl.mistakes.length) exportMistakes(P, edl);
  log(`\n✔ Render xong ${list.length} bài → out/final/. Bước tiếp: v2e thumbs · v2e qa · v2e export`);
}
