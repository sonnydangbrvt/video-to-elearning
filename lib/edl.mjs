// edl.json: nguồn sự thật để render. Nạp, kiểm tra, "snap" ranh giới về đầu/cuối câu,
// và tính các đoạn 1x / 2x / cắt cho mỗi bài.
import { existsSync } from "node:fs";
import { clock, log, parseTime, project, readJSON, slug, writeJSON } from "./util.mjs";

export const DEFAULT_RULES = {
  silenceSpeedFrom: 2.5, // khoảng không lời ≥ 2.5s → tăng tốc
  silenceCutFrom: 25, //    ≥ 25s → cắt, chỉ giữ `keepOfLongSilence`
  speed: 2,
  keepOfLongSilence: 2,
  padBefore: 0.15, // giữ thêm trước câu nói để không cụt phụ âm đầu
  padAfter: 0.25,
  mergeGap: 6, //     hai chỗ cắt cách nhau < 6s → gộp (tránh 2 chuyển cảnh dồn dập, đoạn kẹp giữa thường chỉ là câu rời)
};

export function loadEdl(P) {
  if (!existsSync(P.edl)) throw new Error(`Chưa có edl.json. Copy templates/edl.example.json → ${P.edl} và điền theo PLAN đã duyệt.`);
  const e = readJSON(P.edl);
  const t = (x) => parseTime(x);
  e.rules = { ...DEFAULT_RULES, ...(e.rules || {}) };
  e.lessons = (e.lessons || []).map((l, i) => ({
    ...l,
    index: i + 1,
    start: t(l.start),
    end: t(l.end),
    drops: (l.drops || []).map(([a, b]) => [t(a), t(b)]),
    noSpeedup: (l.noSpeedup || []).map(([a, b]) => [t(a), t(b)]),
    mute: (l.mute || []).map(([a, b]) => [t(a), t(b)]),
    file: `${String(i + 1).padStart(2, "0")}-${l.code}-${slug(l.title)}.mp4`,
  }));
  e.mistakes = (e.mistakes || []).map((m) => ({ ...m, start: t(m.start), end: t(m.end) }));
  e.drops = (e.drops || []).map(([a, b]) => [t(a), t(b)]);
  return e;
}

export const loadCues = (P) => readJSON(P.p("work", "cues.json"), null);
/** Khoảng lặng: ưu tiên bản dò trên audio đã làm sạch (chính xác hơn khi nguồn ồn) */
export const loadSilences = (P) =>
  (readJSON(P.p("work", "silences.clean.json"), null) || readJSON(P.p("work", "silences.json"), null))?.silences || null;

const merge = (ivs) => {
  const s = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const iv of s) {
    const l = out[out.length - 1];
    if (l && iv[0] <= l[1] + 0.01) l[1] = Math.max(l[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
};
const clip = (ivs, a, b) => ivs.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x);

/** Các khoảng bị bỏ hẳn trong 1 bài */
export function dropsFor(edl, l) {
  const d = [...l.drops, ...edl.drops, ...edl.mistakes.filter((m) => m.drop).map((m) => [m.start, m.end])];
  const gap = edl.rules?.mergeGap ?? 6;
  const m = merge(clip(d, l.start, l.end));
  const out = [];
  for (const iv of m) {
    const last = out[out.length - 1];
    if (last && iv[0] - last[1] < gap) last[1] = iv[1];
    else out.push([...iv]);
  }
  return out;
}

/**
 * Chia bài thành các đoạn {s, e, sp}. sp=1 bình thường, sp=speed khi im lặng.
 * Khoảng lặng lấy từ audio (silencedetect) — không phụ thuộc mốc Whisper.
 * Lời nói luôn 1x; giữ padAfter/padBefore của khoảng lặng ở tốc độ thường để không cụt chữ.
 */
export function segmentsFor(edl, silences, l) {
  const R = edl.rules;
  const drops = dropsFor(edl, l);
  const spans = [];
  let cur = l.start;
  for (const [a, b] of drops) { if (a > cur) spans.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < l.end) spans.push([cur, l.end]);

  const protect = merge(l.noSpeedup);
  const segs = [];
  spans.forEach(([S, E], si) => {
    const first = segs.length;
    fill(S, E);
    // chỗ nối sau một đoạn bị cắt (drop) → chuyển cảnh: mờ nhanh + SFX
    if (si > 0 && segs[first]) segs[first].joinIn = true;
    if (si < spans.length - 1 && segs.length > first) segs[segs.length - 1].joinOut = true;
  });
  function fill(S, E) {
    if (!silences) { segs.push({ s: S, e: E, sp: 1 }); return; }
    const gaps = silences
      .map((x) => [Math.max(x.start + R.padAfter, S), Math.min(x.end - R.padBefore, E)])
      .filter(([a, b]) => b - a >= R.silenceSpeedFrom - R.padAfter - R.padBefore);
    let pos = S;
    for (const [ga, gb] of gaps) {
      if (protect.some(([a, b]) => a < gb && b > ga)) continue; // demo cần xem kỹ → giữ 1x
      if (ga > pos) segs.push({ s: pos, e: ga, sp: 1 });
      if (gb - ga >= R.silenceCutFrom) {
        const h = R.keepOfLongSilence / 2; // giữ 1 nửa ở đầu + 1 nửa ở cuối khoảng lặng
        segs.push({ s: ga, e: ga + h, sp: 1, softOut: true }, { s: gb - h, e: gb, sp: 1, softIn: true });
      } else segs.push({ s: ga, e: gb, sp: R.speed });
      pos = gb;
    }
    if (E > pos) segs.push({ s: pos, e: E, sp: 1 });
  }
  const out = [];
  let carryIn = false;
  for (const g0 of segs) {
    const g = { ...g0 };
    if (g.e - g.s < 0.04) {
      // đoạn quá ngắn bị bỏ → chuyển cờ nối sang đoạn kề
      if (g.joinIn) carryIn = true;
      if (g.joinOut && out.length) out[out.length - 1].joinOut = true;
      continue;
    }
    if (carryIn) { g.joinIn = true; carryIn = false; }
    const last = out[out.length - 1];
    if (last && last.sp === g.sp && Math.abs(last.e - g.s) < 0.02 && !g.joinIn && !g.softIn) {
      last.e = g.e;
      if (g.joinOut) last.joinOut = true;
      if (g.softOut) last.softOut = true;
    } else out.push(g);
  }
  return out;
}

export const outDuration = (segs) => segs.reduce((n, g) => n + (g.e - g.s) / g.sp, 0);

/** Gần nhất trong ±win giây */
function nearest(values, t, win) {
  let best = null;
  for (const v of values) if (Math.abs(v - t) <= win && (best === null || Math.abs(v - t) < Math.abs(best - t))) best = v;
  return best;
}

/** `v2e edl <dir> [--snap]` — kiểm tra + tóm tắt thời lượng */
export function edlCheck(args) {
  const P = project(args._[0]);
  const edl = loadEdl(P);
  const cues = loadCues(P);
  const sil = loadSilences(P);
  const media = readJSON(P.p("work", "media.json"), null);
  const dur = media ? parseFloat(media.format.duration) : Infinity;
  const problems = [];
  const raw = readJSON(P.edl);

  // Điểm cắt đẹp: giữa khoảng ngắt hơi (≥0.3s); dự phòng: khe giữa 2 câu liền nhau.
  // Đầu/cuối bài dùng CHUNG một danh sách → 2 bài liền nhau snap về cùng một điểm.
  const real = (cues || []).filter((c) => !c.h);
  const cueGaps = real.slice(1).map((c, i) => (c.start >= real[i].end ? (c.start + real[i].end) / 2 : c.start));
  const points = [...(sil || []).map((x) => (x.start + x.end) / 2), ...cueGaps].sort((a, b) => a - b);
  const edge = (t) => t <= 0.3 || t >= dur - 1;
  const inPause = (t) => edge(t) || (sil || []).some((x) => t >= x.start - 0.05 && t <= x.end + 0.05) || cueGaps.some((g) => Math.abs(g - t) < 0.05);
  if (args.snap) {
    const win = args.window ? +args.window : 5;
    edl.lessons.forEach((l, i) => {
      const s = edge(l.start) ? null : nearest(points, l.start, win), e = edge(l.end) ? null : nearest(points, l.end, win);
      if (!edge(l.start) && s === null) log(`  ⚠️ ${l.code}: không có chỗ ngắt hơi trong ±${win}s quanh start ${clock(l.start)} (đang nói liền) → chọn mốc khác hoặc --window 15`);
      if (!edge(l.end) && e === null) log(`  ⚠️ ${l.code}: không có chỗ ngắt hơi trong ±${win}s quanh end ${clock(l.end)} (đang nói liền) → chọn mốc khác hoặc --window 15`);
      if (s !== null && s !== l.start) { raw.lessons[i].start = +s.toFixed(3); l.start = s; }
      if (e !== null && e !== l.end) { raw.lessons[i].end = +e.toFixed(3); l.end = e; }
    });
    // Đoạn bị cắt: dời mép vào khoảng dừng — đầu cắt ưu tiên SỚM hơn một chút, cuối cắt ưu tiên MUỘN hơn,
    // để không cắt ngang câu (người xem không thấy hụt hẫng).
    const snapDrop = (a, b) => {
      const before = points.filter((x) => x <= a + 0.3 && x >= a - win).pop();
      const after = points.find((x) => x >= b - 0.3 && x <= b + win);
      return [before ?? a, after ?? b];
    };
    let nd = 0;
    (raw.mistakes || []).forEach((m, i) => {
      if (!m.drop) return;
      const [a, b] = snapDrop(edl.mistakes[i].start, edl.mistakes[i].end);
      if (a !== edl.mistakes[i].start || b !== edl.mistakes[i].end) nd++;
      m.start = +a.toFixed(3); m.end = +b.toFixed(3);
    });
    (raw.lessons || []).forEach((rl, i) => (rl.drops || []).forEach((d, k) => {
      const [a, b] = snapDrop(edl.lessons[i].drops[k][0], edl.lessons[i].drops[k][1]);
      d[0] = +a.toFixed(3); d[1] = +b.toFixed(3); nd++;
    }));
    writeJSON(P.edl, raw);
    log(`• Đã dời ${nd} đoạn cắt vào khoảng dừng gần nhất`);
    log(`• Đã snap ranh giới bài vào chỗ ngắt hơi / khe giữa câu gần nhất (±${win}s) và ghi lại edl.json`);
  }

  const codes = new Set();
  let tO = 0, tN = 0;
  log(`\n ${"#".padEnd(3)} ${"Mã".padEnd(5)} ${"Nguồn".padEnd(19)} ${"Gốc".padEnd(9)} → ${"Sau cắt".padEnd(9)} ${"2x".padStart(4)} ${"bỏ".padStart(3)}  Tên bài`);
  for (const l of edl.lessons) {
    if (codes.has(l.code)) problems.push(`Trùng mã bài ${l.code}`);
    codes.add(l.code);
    if (!(l.end > l.start)) problems.push(`${l.code}: end phải > start`);
    if (l.end > dur + 0.5) problems.push(`${l.code}: end ${clock(l.end)} vượt độ dài video ${clock(dur)}`);
    if (!l.title) problems.push(`${l.code}: thiếu title`);
    if (edl.parts && l.part && !edl.parts[l.part]) problems.push(`${l.code}: part "${l.part}" không có trong parts`);
    if (sil || cues) {
      if (!inPause(l.start)) problems.push(`${l.code}: start ${clock(l.start)} không nằm ở chỗ ngắt hơi → có thể cụt lời (dùng --snap)`);
      if (!inPause(l.end)) problems.push(`${l.code}: end ${clock(l.end)} không nằm ở chỗ ngắt hơi → có thể cụt lời (dùng --snap)`);
    }
    const segs = segmentsFor(edl, sil, l);
    const drops = dropsFor(edl, l);
    const orig = l.end - l.start, neu = outDuration(segs);
    tO += orig; tN += neu;
    const warn = neu > 15 * 60 ? " ⚠️ >15'" : neu < 3 * 60 ? " ⚠️ <3'" : "";
    log(` ${String(l.index).padEnd(3)} ${l.code.padEnd(5)} ${clock(l.start)}–${clock(l.end)} ${clock(orig)} → ${clock(neu)} ${String(segs.filter((g) => g.sp > 1).length).padStart(4)} ${String(drops.length).padStart(3)}  ${l.title}${warn}`);
  }
  // chồng lấn giữa các bài
  const sorted = [...edl.lessons].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end - 0.05) problems.push(`${sorted[i - 1].code} và ${sorted[i].code} chồng lấn thời gian`);
  log(`\n TỔNG: ${clock(tO)} → ${clock(tN)} (bớt ${clock(tO - tN)}, ${tO ? Math.round((1 - tN / tO) * 100) : 0}%) · ${edl.lessons.length} bài · ${edl.mistakes.length} đoạn lỗi (${edl.mistakes.filter((m) => m.drop).length} bỏ)`);
  if (!sil) log(" ⚠️ Chưa có work/silences.json → không tăng tốc khoảng lặng được (chạy v2e prepare).");
  if (problems.length) {
    log("\n VẤN ĐỀ:\n" + problems.map((p) => "  ✗ " + p).join("\n"));
    process.exitCode = 1;
  } else log(" ✔ edl.json hợp lệ");
}
