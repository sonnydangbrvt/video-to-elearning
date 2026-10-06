#!/usr/bin/env node
// mux-publisher — đẩy một bộ video lên Mux, lưu ID/phiên vào sổ đăng ký dùng chung, xuất thư mục bàn giao chuẩn.
// Không cần thư viện ngoài (Node ≥ 18). Token: env MUX_TOKEN_ID/MUX_TOKEN_SECRET hoặc ~/.config/video-to-elearning/mux.json
//
//   doctor
//   init <folder> [--from-v2e] --course "…" --group <slug> [--owner <id>] [--policy signed|public]
//   plan <folder>                         → bảng XÁC NHẬN (không upload)
//   upload <folder> [--test] [--only L01,L02] --yes
//   adopt <folder> [--from-state out/mux/state.json]   → nhận các video ĐÃ có trên Mux vào sổ đăng ký
//   mp4 <folder> --yes                    → bật link MP4 (static rendition "highest") cho video chưa có
//   export <folder> [--out <dir>]         → thư mục bàn giao chuẩn
//   find <query>                          → tra cứu trong sổ đăng ký (tiêu đề, mã bài, nhóm, asset/playback ID, phiên)
//   sessions [--group <slug>]             → danh sách phiên upload
import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

setDefaultResultOrder("ipv4first"); // IPv6 ở một số mạng VN chậm → fetch timeout
const CFG_DIR = join(homedir(), ".config", "video-to-elearning");
const TOKEN_FILE = join(CFG_DIR, "mux.json");
const REGISTRY = join(CFG_DIR, "mux-registry.json");
const API = "https://api.mux.com/video/v1";

// ---------- tiện ích ----------
const log = (...a) => console.log(...a);
const readJSON = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
const writeJSON = (f, d) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(d, null, 2) + "\n"); };
const writeText = (f, s) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const clock = (sec) => { const s = Math.round(sec || 0); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const slug = (x, max = 60) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const htmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); if (v !== undefined) o[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith("--")) o[k] = argv[++i]; else o[k] = true; }
    else o._.push(a);
  }
  return o;
}
const paths = (folder) => { const root = resolve(folder); const pub = join(root, "mux-publish"); return { root, pub, manifest: join(pub, "manifest.json"), state: join(pub, "state.json") }; };

// ---------- Mux API ----------
function creds() {
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) return [process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET];
  const c = readJSON(TOKEN_FILE, null);
  if (!c?.tokenId || !c?.tokenSecret) throw new Error(`Chưa có Mux access token. Mux Dashboard → Settings → Access Tokens (Mux Video: Read + Write) → lưu {"tokenId","tokenSecret"} vào ${TOKEN_FILE} (chmod 600).`);
  return [c.tokenId, c.tokenSecret];
}
async function api(method, path, body) {
  const [id, secret] = creds();
  let r;
  for (let i = 1; ; i++) {
    try {
      r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      break;
    } catch (e) { if (i >= 3) throw new Error(`Không kết nối được Mux (${e.cause?.code || e.message})`); await sleep(2000 * i); }
  }
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const msg = j.error?.messages?.join("; ") || txt.slice(0, 300);
    if (/Free plan is limited/i.test(msg)) throw new Error(`Tài khoản Mux đang ở GÓI FREE (tối đa 10 video) — người dùng nâng cấp ở Dashboard → Billing rồi chạy lại. (${msg})`);
    throw new Error(`Mux API ${r.status} ${path}: ${msg}`);
  }
  return j.data ?? j;
}

// ---------- sổ đăng ký dùng chung ----------
const registry = () => readJSON(REGISTRY, { version: 1, assets: {}, sessions: {} });
const saveRegistry = (reg) => writeJSON(REGISTRY, reg);

/** Dấu vân tay file: kích thước + sha1(4MB đầu + 4MB cuối) — nhận ra file đã upload, kể cả đổi tên */
function fingerprint(file) {
  const size = statSync(file).size, n = Math.min(4 << 20, size), fd = openSync(file, "r"), h = createHash("sha1");
  const a = Buffer.alloc(n); readSync(fd, a, 0, n, 0); h.update(a);
  const b = Buffer.alloc(n); readSync(fd, b, 0, n, Math.max(0, size - n)); h.update(b);
  closeSync(fd);
  return `${size}:${h.digest("hex").slice(0, 16)}`;
}

// ---------- URL & mã nhúng ----------
export function urlsFor(a, group = "") {
  const pb = a.playbackId;
  const q = new URLSearchParams({ "metadata-video-title": a.title || "", "metadata-video-id": a.code || "", ...(group ? { "metadata-video-series": group } : {}) });
  const mp4 = a.mp4 === "ready" ? `https://stream.mux.com/${pb}/highest.mp4` : null;
  return {
    playerUrl: `https://player.mux.com/${pb}`,
    hlsUrl: `https://stream.mux.com/${pb}.m3u8`,
    mp4Url: mp4,
    mp4DownloadUrl: mp4 ? `${mp4}?download=${encodeURIComponent(slug(`${a.code}-${a.title}`, 80) || a.code)}` : null,
    thumbnailUrl: `https://image.mux.com/${pb}/thumbnail.jpg`,
    embedHtml: `<iframe src="https://player.mux.com/${pb}?${q}" style="width: 100%; border: none; aspect-ratio: 16/9;" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`,
    requiresToken: a.policy === "signed",
  };
}

// ---------- init ----------
function naturalSort(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }

function initFromV2e(root) {
  const edl = readJSON(join(root, "edl.json"), null);
  if (!edl) throw new Error("--from-v2e: không thấy edl.json trong thư mục");
  const finals = existsSync(join(root, "out", "final")) ? readdirSync(join(root, "out", "final")).filter((f) => f.endsWith(".mp4")) : [];
  return {
    course: edl.mux?.courseName || edl.youtube?.courseName || edl.course,
    group: edl.mux?.group, owner: edl.mux?.creatorId, policy: edl.mux?.policy || null, language: edl.youtube?.language || "vi",
    lessons: edl.lessons.map((l, i) => {
      const order = i + 1;
      const fname = finals.find((f) => f.startsWith(`${pad(order)}-${l.code}-`));
      const file = fname ? join(root, "out", "final", fname) : join(root, "out", "final", `${pad(order)}-${l.code}.mp4`);
      const c = readJSON(join(root, "work", "lesson-content", `${l.code}.json`), {});
      const thumb = join(root, "out", "thumb", `${pad(order)}-${l.code}.png`);
      const srt = file.replace(join("out", "final"), join("out", "captions")).replace(/\.mp4$/, ".srt");
      return {
        order, code: l.code, title: `${l.lessonLabel || `Bài ${l.code}`}: ${l.title.replace(/\*\*/g, "")}`, part: (edl.parts?.[l.part] || "").replace(/^PHẦN\s+/, ""),
        file: existsSync(file) ? file : null, summary: c.summary || "", objectives: c.objectives || [], checklist: c.checklist || l.bullets || [],
        keyTerms: c.keyTerms || [], tools: c.tools || [], practice: c.practice || "", level: c.level || "", isBonus: !!l.bonus,
        thumbnail: existsSync(thumb) ? thumb : null, captions: existsSync(srt) ? srt : null,
      };
    }),
  };
}

function initFromFolder(root) {
  const files = readdirSync(root).filter((f) => /\.(mp4|mov|m4v|mkv|webm)$/i.test(f)).sort(naturalSort);
  if (!files.length) throw new Error(`Không thấy file video trong ${root}`);
  return {
    lessons: files.map((f, i) => {
      const base = basename(f, extname(f));
      const thumb = ["png", "jpg"].map((x) => join(root, `${base}.${x}`)).find(existsSync) || null;
      const srt = ["srt", "vtt"].map((x) => join(root, `${base}.${x}`)).find(existsSync) || null;
      return { order: i + 1, code: `L${pad(i + 1)}`, title: base.replace(/[-_]+/g, " ").trim(), part: "", file: join(root, f), summary: "", objectives: [], checklist: [], keyTerms: [], tools: [], practice: "", level: "", isBonus: false, thumbnail: thumb, captions: srt };
    }),
  };
}

function init(o) {
  const P = paths(o._[1] || ".");
  if (existsSync(P.manifest) && !o.force) throw new Error(`Đã có ${P.manifest} (dùng --force để tạo lại)`);
  const base = o["from-v2e"] ? initFromV2e(P.root) : initFromFolder(P.root);
  const course = o.course || base.course || basename(P.root);
  const m = {
    schema: "mux-publisher/1",
    course, group: o.group || base.group || slug(course), owner: o.owner || base.owner || "",
    policy: o.policy || base.policy || null, // KHÔNG mặc định — bắt buộc xác nhận
    quality: o.quality || "basic", mp4: o.mp4 === "false" ? false : true, language: o.language || base.language || "vi",
    lessons: base.lessons,
  };
  writeJSON(P.manifest, m);
  log(`✔ ${P.manifest}\n  ${m.lessons.length} bài · nhóm ${m.group} · chủ sở hữu ${m.owner || "(trống)"} · chính sách ${m.policy || "❌ chưa chọn"}\n  Sửa tiêu đề/mô tả nếu cần (Claude có thể soạn summary/objectives/checklist từ transcript), rồi: mux-pub plan ${o._[1] || "."}`);
}

// ---------- plan / upload ----------
function confirmTable(m, todo, skipped) {
  return `\n XÁC NHẬN TRƯỚC KHI ĐẨY LÊN MUX
  • Chính sách phát : ${m.policy ? `${m.policy.toUpperCase()}${m.policy === "public" ? "  (ai có link cũng xem được)" : "  (cần token do website cấp)"}` : "❌ CHƯA CHỌN — đặt manifest.policy hoặc --policy signed|public"}
  • Chủ sở hữu      : ${m.owner || "(trống — nên đặt: coachio / mã đối tác)"}
  • Nhóm (khoá)     : ${m.group}
  • Tên khoá        : ${m.course}
  • Chất lượng      : ${m.quality} · Link MP4: ${m.mp4 ? "BẬT (tốn thêm phí lưu trữ)" : "tắt"}
  • Số video        : ${todo.length} mới${skipped ? ` · ${skipped} đã có (bỏ qua)` : ""}
${todo.map((l) => `      ${pad(l.order)} ${l.code} · ${l.part || "-"} · ${l.title}`).join("\n")}\n`;
}

async function waitReady(uploadId) {
  let assetId = null;
  for (let i = 0; i < 240; i++) {
    if (!assetId) {
      const u = await api("GET", `/uploads/${uploadId}`);
      if (["errored", "cancelled", "timed_out"].includes(u.status)) throw new Error(`Upload ${u.status}`);
      assetId = u.asset_id || null;
    }
    if (assetId) {
      const a = await api("GET", `/assets/${assetId}`);
      if (a.status === "ready") return a;
      if (a.status === "errored") throw new Error(`Asset lỗi: ${JSON.stringify(a.errors || {})}`);
    }
    await sleep(5000);
  }
  throw new Error("Quá 20 phút chưa xử lý xong");
}

async function putFile(url, file) {
  const size = statSync(file).size;
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(url, { method: "PUT", duplex: "half", headers: { "Content-Length": String(size), "Content-Type": "video/mp4" }, body: createReadStream(file) });
      if (r.ok) return;
      throw new Error(`PUT ${r.status}`);
    } catch (e) { if (i === 4) throw e; log(`  ⚠️ ${e.message} — thử lại ${i}/3`); await sleep(3000 * i); }
  }
}

function pending(P, m, o) {
  const reg = registry();
  let list = m.lessons.filter((l) => l.file && existsSync(l.file));
  if (o.only) { const s = String(o.only).split(","); list = list.filter((l) => s.includes(l.code)); }
  const known = (l) => Object.values(reg.assets).find((a) => a.group === m.group && (a.code === l.code || (a.fingerprint && l.file && a.fingerprint === fingerprint(l.file))));
  const todo = list.filter((l) => !known(l));
  return { todo: o.test ? todo.slice(0, 1) : todo, skipped: list.length - todo.length };
}

function plan(o) {
  const P = paths(o._[1] || "."), m = readJSON(P.manifest, null);
  if (!m) throw new Error("Chưa có manifest — chạy init trước");
  if (o.policy) m.policy = o.policy;
  const { todo, skipped } = pending(P, m, o);
  log(confirmTable(m, todo, skipped));
}

async function upload(o) {
  const P = paths(o._[1] || "."), m = readJSON(P.manifest, null);
  if (!m) throw new Error("Chưa có manifest — chạy init trước");
  if (o.policy) m.policy = o.policy;
  const { todo, skipped } = pending(P, m, o);
  log(confirmTable(m, todo, skipped));
  if (!m.policy) { process.exitCode = 2; return; }
  if (!["signed", "public"].includes(m.policy)) throw new Error("policy phải là signed | public");
  if (!o.yes) { log(" Chưa xác nhận. Gửi bảng trên cho người dùng; chỉ khi họ đồng ý mới chạy lại với --yes."); process.exitCode = 2; return; }
  if (!todo.length) { log("Không có video mới."); return; }
  const reg = registry();
  const now = new Date();
  const sessionId = `${m.group}-${now.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2")}`;
  reg.sessions[sessionId] = { id: sessionId, at: now.toISOString(), group: m.group, course: m.course, owner: m.owner, policy: m.policy, project: P.root, assetIds: [] };
  for (const l of todo) {
    log(`▶ [${pad(l.order)}] ${l.title}`);
    const fp = fingerprint(l.file);
    const up = await api("POST", "/uploads", {
      cors_origin: "*",
      new_asset_settings: {
        playback_policies: [m.policy], video_quality: m.quality,
        ...(m.mp4 ? { static_renditions: [{ resolution: "highest" }] } : {}),
        passthrough: JSON.stringify({ g: m.group, cat: l.part || "", code: l.code, i: l.order }).slice(0, 255),
        meta: { title: l.title.slice(0, 250), external_id: `${m.group}:${l.code}`.slice(0, 128), ...(m.owner ? { creator_id: m.owner } : {}) },
      },
    });
    await putFile(up.url, l.file);
    log("  • đã tải lên, chờ Mux xử lý…");
    const a = await waitReady(up.id);
    const pb = a.playback_ids?.find((x) => x.policy === m.policy) || a.playback_ids?.[0];
    reg.assets[a.id] = {
      assetId: a.id, playbackId: pb?.id, policy: pb?.policy, uploadId: up.id, group: m.group, owner: m.owner, course: m.course,
      code: l.code, order: l.order, title: l.title, part: l.part || "", duration: a.duration, file: l.file, fingerprint: fp,
      sessionId, uploadedAt: new Date().toISOString(), mp4: m.mp4 ? "preparing" : "none", project: P.root,
    };
    reg.sessions[sessionId].assetIds.push(a.id);
    saveRegistry(reg);
    log(`  ✔ ${a.id} · playback ${pb?.id} (${pb?.policy}) · ${clock(a.duration)}`);
  }
  log(`\n✔ Phiên ${sessionId}: ${reg.sessions[sessionId].assetIds.length} video. ${m.mp4 ? "Link MP4 cần thêm vài phút — chạy: mux-pub mp4 <folder> --yes (kiểm tra & chờ) rồi export." : "Tiếp: mux-pub export <folder>"}`);
}

// ---------- adopt: nhận video đã có trên Mux ----------
async function adopt(o) {
  const P = paths(o._[1] || "."), m = readJSON(P.manifest, null);
  if (!m) throw new Error("Chưa có manifest — chạy init trước");
  const reg = registry();
  const stateFile = o["from-state"] ? resolve(P.root, o["from-state"]) : join(P.root, "out", "mux", "state.json");
  const fromState = readJSON(stateFile, { videos: {} }).videos;
  const sessionId = `${m.group}-adopted`;
  reg.sessions[sessionId] = reg.sessions[sessionId] || { id: sessionId, at: new Date().toISOString(), group: m.group, course: m.course, owner: m.owner, policy: m.policy, project: P.root, assetIds: [], note: "nhận lại video đã upload trước đó" };
  let n = 0;
  for (const l of m.lessons) {
    let assetId = fromState[l.code]?.id;
    if (!assetId) {
      // dò trên Mux theo external_id
      const list = await api("GET", `/assets?limit=100`);
      assetId = list.find((a) => a.meta?.external_id === `${m.group}:${l.code}`)?.id;
    }
    if (!assetId) { log(`  ⚠️ ${l.code}: không tìm thấy trên Mux`); continue; }
    const a = await api("GET", `/assets/${assetId}`);
    const pb = a.playback_ids?.[0];
    const sr = a.static_renditions?.files || [];
    reg.assets[a.id] = {
      ...(reg.assets[a.id] || {}), assetId: a.id, playbackId: pb?.id, policy: pb?.policy, group: m.group, owner: a.meta?.creator_id || m.owner, course: m.course,
      code: l.code, order: l.order, title: a.meta?.title || l.title, part: l.part || "", duration: a.duration, file: l.file,
      fingerprint: l.file && existsSync(l.file) ? fingerprint(l.file) : null, sessionId: reg.assets[a.id]?.sessionId || sessionId,
      uploadedAt: reg.assets[a.id]?.uploadedAt || new Date(Number(a.created_at) * 1000).toISOString(),
      mp4: sr.some((f) => f.name === "highest.mp4" && f.status === "ready") ? "ready" : sr.length ? "preparing" : "none", project: P.root,
    };
    if (!reg.sessions[sessionId].assetIds.includes(a.id) && reg.assets[a.id].sessionId === sessionId) reg.sessions[sessionId].assetIds.push(a.id);
    n++;
  }
  saveRegistry(reg);
  log(`✔ Đã đưa ${n}/${m.lessons.length} video của nhóm ${m.group} vào sổ đăng ký ${REGISTRY}`);
}

// ---------- mp4 ----------
async function mp4(o) {
  const P = paths(o._[1] || "."), m = readJSON(P.manifest, null);
  if (!m) throw new Error("Chưa có manifest");
  const reg = registry();
  const mine = Object.values(reg.assets).filter((a) => a.group === m.group);
  const need = mine.filter((a) => a.mp4 !== "ready");
  log(`Nhóm ${m.group}: ${mine.length} video · ${mine.length - need.length} đã có MP4 · ${need.length} cần bật/chờ. (Mux tính thêm phí lưu trữ cho bản MP4.)`);
  if (!need.length) return;
  if (!o.yes) { log("Chưa xác nhận bật MP4 — hỏi người dùng rồi chạy lại với --yes."); process.exitCode = 2; return; }
  for (const a of need) {
    const cur = await api("GET", `/assets/${a.assetId}`);
    const files = cur.static_renditions?.files || [];
    if (!files.some((f) => f.name === "highest.mp4")) {
      await api("POST", `/assets/${a.assetId}/static-renditions`, { resolution: "highest" });
      log(`  • ${a.code}: đã yêu cầu tạo MP4`);
    }
  }
  log("• Chờ Mux tạo xong MP4…");
  for (let i = 0; i < 120; i++) {
    let left = 0;
    for (const a of need) {
      if (a.mp4 === "ready") continue;
      const cur = await api("GET", `/assets/${a.assetId}`);
      const f = (cur.static_renditions?.files || []).find((x) => x.name === "highest.mp4");
      if (f?.status === "ready") { a.mp4 = "ready"; reg.assets[a.assetId].mp4 = "ready"; log(`  ✔ ${a.code} MP4 sẵn sàng`); }
      else if (f?.status === "errored") { reg.assets[a.assetId].mp4 = "errored"; a.mp4 = "ready"; log(`  ✗ ${a.code} MP4 lỗi`); }
      else left++;
    }
    saveRegistry(reg);
    if (!left) break;
    await sleep(10000);
  }
  log(`✔ MP4: ${Object.values(reg.assets).filter((a) => a.group === m.group && a.mp4 === "ready").length}/${mine.length} sẵn sàng`);
}

// ---------- export ----------
function exportFolder(o) {
  const P = paths(o._[1] || "."), m = readJSON(P.manifest, null);
  if (!m) throw new Error("Chưa có manifest");
  const reg = registry();
  const byCode = Object.fromEntries(Object.values(reg.assets).filter((a) => a.group === m.group).map((a) => [a.code, a]));
  const out = o.out ? resolve(o.out) : join(P.pub, "export", m.group);
  const lessons = m.lessons.map((l) => {
    const a = byCode[l.code];
    const u = a ? urlsFor(a, m.group) : null;
    const dir = `${pad(l.order)}-${l.code}-${slug(l.title.replace(/^(Bài|Bonus)\s*\w+:\s*/i, ""), 50)}`;
    return {
      order: l.order, code: l.code, title: l.title, part: l.part, isBonus: !!l.isBonus,
      duration: a ? clock(a.duration) : null, durationSec: a ? Math.round(a.duration) : null,
      summary: l.summary, objectives: l.objectives, checklist: l.checklist, keyTerms: l.keyTerms, tools: l.tools, practice: l.practice, level: l.level,
      mux: a ? { assetId: a.assetId, playbackId: a.playbackId, policy: a.policy, sessionId: a.sessionId, uploadedAt: a.uploadedAt, mp4: a.mp4, ...u } : null,
      folder: `lessons/${dir}`, _thumb: l.thumbnail, _srt: l.captions,
    };
  });
  const total = lessons.reduce((n, x) => n + (x.durationSec || 0), 0);
  const course = {
    schema: "mux-publisher.export/1", generatedAt: new Date().toISOString(),
    course: { title: m.course, group: m.group, owner: m.owner, policy: m.policy, language: m.language, lessonCount: lessons.length, duration: clock(total), durationSec: total },
    lessons: lessons.map(({ _thumb, _srt, ...x }) => ({ ...x, files: { thumbnail: _thumb ? `${x.folder}/thumbnail${extname(_thumb)}` : null, captions: _srt ? `${x.folder}/captions.${m.language}${extname(_srt)}` : null } })),
    missing: { mux: lessons.filter((x) => !x.mux).map((x) => x.code), mp4: lessons.filter((x) => x.mux && x.mux.mp4 !== "ready").map((x) => x.code), content: lessons.filter((x) => !x.summary).map((x) => x.code) },
  };
  writeJSON(join(out, "course.json"), course);

  for (const x of lessons) {
    const d = join(out, x.folder);
    mkdirSync(d, { recursive: true });
    if (x._thumb && existsSync(x._thumb)) copyFileSync(x._thumb, join(d, `thumbnail${extname(x._thumb)}`));
    if (x._srt && existsSync(x._srt)) copyFileSync(x._srt, join(d, `captions.${m.language}${extname(x._srt)}`));
    const { _thumb, _srt, ...clean } = x;
    writeJSON(join(d, "lesson.json"), clean);
    if (x.mux) writeText(join(d, "embed.html"), x.mux.embedHtml + "\n");
    writeText(join(d, "lesson.md"), [
      `# ${x.title}`, "",
      `- Phần: ${x.part || "—"} · Thời lượng: **${x.duration ?? "?"}**${x.isBonus ? " · Bonus" : ""}`,
      x.mux ? `- Player: ${x.mux.playerUrl}\n- MP4: ${x.mux.mp4Url || "(chưa bật)"}\n- HLS: ${x.mux.hlsUrl}\n- Asset ID: \`${x.mux.assetId}\` · Playback ID: \`${x.mux.playbackId}\` · Phiên: \`${x.mux.sessionId}\`${x.mux.requiresToken ? "\n- ⚠️ SIGNED: mọi URL cần token" : ""}` : "- ⚠️ chưa có trên Mux",
      x.summary ? `\n## Mô tả\n\n${x.summary}` : "",
      x.objectives?.length ? `\n## Mục tiêu\n\n${x.objectives.map((v) => `- ${v}`).join("\n")}` : "",
      x.checklist?.length ? `\n## Nội dung\n\n${x.checklist.map((v) => `- [ ] ${v}`).join("\n")}` : "",
      x.keyTerms?.length ? `\n## Thuật ngữ\n\n${x.keyTerms.join(", ")}` : "",
      x.practice ? `\n## Thực hành\n\n${x.practice}` : "",
      x.mux ? `\n## Mã nhúng\n\n\`\`\`html\n${x.mux.embedHtml}\n\`\`\`` : "", "",
    ].filter((s) => s !== "").join("\n"));
  }

  const rows = course.lessons;
  writeText(join(out, "lessons.csv"), "﻿order,code,part,title,duration,durationSec,playerUrl,mp4Url,hlsUrl,embedHtml,assetId,playbackId,policy,sessionId,summary,objectives,checklist,keyTerms,folder\n" +
    rows.map((x) => [x.order, x.code, x.part, x.title, x.duration, x.durationSec, x.mux?.playerUrl, x.mux?.mp4Url, x.mux?.hlsUrl, x.mux?.embedHtml, x.mux?.assetId, x.mux?.playbackId, x.mux?.policy, x.mux?.sessionId, x.summary, (x.objectives || []).join(" | "), (x.checklist || []).join(" | "), (x.keyTerms || []).join(", "), x.folder].map(esc).join(",")).join("\n") + "\n");

  writeText(join(out, "README.md"), `# ${m.course}\n\n- Nhóm: \`${m.group}\` · Chủ sở hữu: \`${m.owner || "—"}\` · Chính sách: **${m.policy}** · ${rows.length} bài · tổng **${clock(total)}**\n- Máy đọc: \`course.json\` (schema mux-publisher.export/1) · Bảng: \`lessons.csv\` · Xem thử: \`embeds.html\` · Từng bài: \`lessons/<NN-MÃ-tên>/\` (lesson.md, lesson.json, embed.html, thumbnail, phụ đề)\n- Tra lại ID/phiên: \`registry-snapshot.json\` hoặc \`mux-pub find <từ khoá>\`\n\n| # | Mã | Bài | Thời lượng | Player | MP4 |\n|---|---|---|---|---|---|\n` +
    rows.map((x) => `| ${pad(x.order)} | ${x.code} | ${x.title} | ${x.duration ?? "?"} | ${x.mux ? `[xem](${x.mux.playerUrl})` : "—"} | ${x.mux?.mp4Url ? `[mp4](${x.mux.mp4Url})` : "—"} |`).join("\n") +
    `\n${course.missing.mux.length + course.missing.mp4.length + course.missing.content.length ? `\n⚠️ Thiếu — Mux: ${course.missing.mux.join(",") || "0"} · MP4: ${course.missing.mp4.join(",") || "0"} · nội dung: ${course.missing.content.join(",") || "0"}\n` : ""}`);

  writeText(join(out, "embeds.html"), `<!doctype html><html lang="${m.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(m.course)}</title><style>body{font-family:system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;background:#f4f5f7;color:#0f2547}.c{background:#fff;border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}h2{font-size:16px;margin:0 0 10px}textarea{width:100%;height:64px;font:12px monospace;margin-top:8px}a{color:#2563eb}</style></head><body><h1>${htmlEsc(m.course)} — ${rows.length} bài · ${clock(total)}</h1>\n` +
    rows.filter((x) => x.mux).map((x) => `<div class="c"><h2>${pad(x.order)}. ${htmlEsc(x.title)} · ${x.duration}</h2>${x.mux.embedHtml}<p>${x.mux.mp4Url ? `<a href="${x.mux.mp4Url}">MP4</a> · ` : ""}<a href="${x.mux.playerUrl}">Player</a></p><textarea readonly onclick="this.select()">${htmlEsc(x.mux.embedHtml)}</textarea></div>`).join("\n") + `</body></html>`);

  writeJSON(join(out, "registry-snapshot.json"), { group: m.group, sessions: Object.values(reg.sessions).filter((s) => s.group === m.group), assets: Object.values(reg.assets).filter((a) => a.group === m.group) });
  log(`✔ ${out}\n  ${rows.length} bài · ${clock(total)} · thiếu Mux: ${course.missing.mux.length} · thiếu MP4: ${course.missing.mp4.length} · thiếu nội dung: ${course.missing.content.length}`);
}

// ---------- find / sessions ----------
function find(o) {
  const q = (o._.slice(1).join(" ") || "").toLowerCase();
  const reg = registry();
  const hits = Object.values(reg.assets).filter((a) => [a.title, a.code, a.group, a.owner, a.course, a.assetId, a.playbackId, a.sessionId].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => `${a.group}`.localeCompare(`${b.group}`) || a.order - b.order);
  if (!hits.length) { log(`Không thấy "${q}" trong ${REGISTRY}`); return; }
  for (const a of hits) log(`${a.group} · ${a.code} · ${a.title} · ${clock(a.duration)} · ${a.policy} · mp4:${a.mp4}\n   asset ${a.assetId} · playback ${a.playbackId} · phiên ${a.sessionId}\n   ${urlsFor(a, a.group).playerUrl}`);
  log(`\n${hits.length} kết quả`);
}
function sessions(o) {
  const reg = registry();
  const list = Object.values(reg.sessions).filter((s) => !o.group || s.group === o.group).sort((a, b) => a.at.localeCompare(b.at));
  for (const s of list) log(`${s.id} · ${s.at.slice(0, 16).replace("T", " ")} · ${s.course} · ${s.policy} · ${s.assetIds.length} video · ${s.project}`);
  if (!list.length) log("Chưa có phiên nào.");
}

async function doctor() {
  const major = +process.versions.node.split(".")[0];
  log(`${major >= 18 ? "✅" : "❌"} Node ${process.versions.node}`);
  try { creds(); log("✅ Có Mux token"); const a = await api("GET", "/assets?limit=1"); log(`✅ Token hợp lệ (gọi API OK, ${a.length ? "có" : "chưa có"} video)`); }
  catch (e) { log(`❌ ${e.message}`); process.exitCode = 1; }
  const reg = registry();
  log(`ℹ️ Sổ đăng ký: ${REGISTRY} · ${Object.keys(reg.assets).length} video · ${Object.keys(reg.sessions).length} phiên`);
}

const HELP = `mux-pub — đẩy bộ video lên Mux, lưu ID/phiên, xuất thư mục bàn giao
  doctor
  init <folder> [--from-v2e] --course "…" --group <slug> [--owner id] [--policy signed|public] [--mp4 false]
  plan <folder>                          bảng XÁC NHẬN (không upload)
  upload <folder> [--test] [--only L01] --yes
  adopt <folder> [--from-state file]     nhận video đã có trên Mux vào sổ đăng ký
  mp4 <folder> --yes                     bật & chờ link MP4
  export <folder> [--out dir]            thư mục bàn giao chuẩn
  find <từ khoá>                         tra cứu sổ đăng ký
  sessions [--group slug]                danh sách phiên upload`;

const o = args(process.argv.slice(2));
const CMDS = { doctor, init, plan, upload, adopt, mp4, export: exportFolder, find, sessions };
const cmd = o._[0];
if (!CMDS[cmd]) { log(HELP); process.exit(cmd ? 1 : 0); }
try { await CMDS[cmd](o); } catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); }
