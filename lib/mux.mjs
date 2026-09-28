// `v2e mux`: đẩy bộ bài lên Mux Video qua API (Direct Upload) — host thứ hai bên cạnh YouTube.
//   check                              → kiểm tra access token (đọc env MUX_TOKEN_ID/MUX_TOKEN_SECRET hoặc ~/.config/video-to-elearning/mux.json)
//   upload [--policy signed|public] [--test] --yes [--only A1,A2]
//                                      → mỗi bài: tạo Direct Upload → PUT file → chờ asset ready → ghi out/mux/state.json
//   links                              → out/mux/links.md + links.csv
// Mux MCP chính thức (https://mcp.mux.com) KHÔNG đọc được file trên máy → upload file cục bộ phải qua lệnh này.
import { setDefaultResultOrder } from "node:dns";
import { createReadStream, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadEdl } from "./edl.mjs";
import { clock, log, project, readJSON, writeJSON, writeText } from "./util.mjs";

setDefaultResultOrder("ipv4first"); // IPv6 ở một số mạng VN chậm → fetch timeout
const CFG = join(homedir(), ".config", "video-to-elearning", "mux.json");
const API = "https://api.mux.com/video/v1";

const HELP = `Chưa có Mux access token. Làm 1 lần:
  1. https://dashboard.mux.com → Settings → Access Tokens → Generate new token
     • Environment: Production (hoặc môi trường bạn dùng cho khoá học)
     • Permissions: Mux Video = Read + Write (không cần Mux Data để upload)
  2. Lưu Token ID + Secret (chỉ hiện 1 lần) vào ${CFG} — chạy trong Terminal:
     mkdir -p ~/.config/video-to-elearning && umask 077 && cat > ~/.config/video-to-elearning/mux.json
     rồi dán: {"tokenId":"…","tokenSecret":"…"} → Enter → Ctrl-D
     (hoặc export MUX_TOKEN_ID=… MUX_TOKEN_SECRET=…)
  3. v2e mux <dir> check`;

function creds() {
  if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) return { id: process.env.MUX_TOKEN_ID, secret: process.env.MUX_TOKEN_SECRET };
  const c = readJSON(CFG, null);
  if (!c?.tokenId || !c?.tokenSecret) throw new Error(HELP);
  return { id: c.tokenId, secret: c.tokenSecret };
}

async function api(method, path, body) {
  const { id, secret } = creds();
  let r;
  for (let i = 1; ; i++) {
    try { r = await fetchOnce(); break; } catch (e) { if (i >= 3) throw new Error(`Không kết nối được Mux (${e.cause?.code || e.message}) — kiểm tra mạng`); await sleep(2000 * i); }
  }
  async function fetchOnce() { return fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }); }
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!r.ok) throw new Error(`Mux API ${r.status} ${path}: ${j.error?.messages?.join("; ") || txt.slice(0, 300)}`);
  return j.data ?? j;
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function check() {
  const assets = await api("GET", "/assets?limit=5");
  log(`✔ Token hợp lệ · môi trường có ${assets.length ? `≥${assets.length}` : "0"} asset (xem 5 gần nhất)`);
  for (const a of assets) log(`  - ${a.id} · ${a.meta?.title || a.passthrough || "(không tên)"} · ${a.status} · ${a.duration ? clock(a.duration) : ""}`);
}

async function putFile(url, file) {
  const size = statSync(file).size;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, { method: "PUT", duplex: "half", headers: { "Content-Length": String(size), "Content-Type": "video/mp4" }, body: createReadStream(file) });
      if (r.ok) return;
      throw new Error(`PUT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      if (attempt === 4) throw e;
      log(`  ⚠️ ${e.message} — thử lại ${attempt}/3`);
      await sleep(3000 * attempt);
    }
  }
}

async function waitReady(uploadId) {
  let assetId = null;
  for (let i = 0; i < 180; i++) { // tối đa ~15 phút
    if (!assetId) {
      const u = await api("GET", `/uploads/${uploadId}`);
      if (u.status === "errored" || u.status === "cancelled" || u.status === "timed_out") throw new Error(`Upload ${u.status}: ${JSON.stringify(u.error || {})}`);
      assetId = u.asset_id || null;
    }
    if (assetId) {
      const a = await api("GET", `/assets/${assetId}`);
      if (a.status === "ready") return a;
      if (a.status === "errored") throw new Error(`Asset lỗi: ${JSON.stringify(a.errors || {})}`);
    }
    await sleep(5000);
  }
  throw new Error("Quá 15 phút chưa xử lý xong (kiểm tra trên dashboard)");
}

async function upload(P, args) {
  if (!args.yes) { log("Chưa xác nhận. Hỏi người dùng (chính sách phát signed/public, danh sách bài) rồi chạy lại với --yes."); process.exitCode = 2; return; }
  const edl = loadEdl(P);
  const policy = args.policy || edl.mux?.policy || "signed";
  if (!["signed", "public"].includes(policy)) throw new Error("--policy phải là signed | public");
  const course = edl.mux?.courseName || edl.youtube?.courseName || edl.course;
  const stateFile = P.p("out", "mux", "state.json");
  const state = readJSON(stateFile, { videos: {}, policy });
  let list = edl.lessons.filter((l) => existsSync(P.p("out", "final", l.file)));
  if (args.only) { const o = String(args.only).split(","); list = list.filter((l) => o.includes(l.code)); }
  if (args.test) list = list.filter((l) => !state.videos[l.code]).slice(0, 1);
  for (const l of list) {
    if (state.videos[l.code]?.playbackId) { log(`↷ ${l.code} đã có trên Mux`); continue; }
    const title = `${l.lessonLabel || `Bài ${l.code}`}: ${l.title.replace(/\*\*/g, "")}`.slice(0, 250);
    log(`▶ [${String(l.index).padStart(2, "0")}] ${title}`);
    const up = await api("POST", "/uploads", {
      cors_origin: "*",
      new_asset_settings: {
        playback_policies: [policy],
        video_quality: edl.mux?.videoQuality || "basic",
        passthrough: JSON.stringify({ course, code: l.code, index: l.index }).slice(0, 255),
        meta: { title, external_id: `${edl.mux?.externalPrefix || "v2e"}:${l.code}`, ...(edl.mux?.creatorId ? { creator_id: edl.mux.creatorId } : {}) },
      },
    });
    await putFile(up.url, P.p("out", "final", l.file));
    log("  • đã tải file lên, chờ Mux xử lý…");
    const a = await waitReady(up.id);
    const pb = a.playback_ids?.find((x) => x.policy === policy) || a.playback_ids?.[0];
    state.videos[l.code] = { id: a.id, playbackId: pb?.id, privacy: pb?.policy, title, index: l.index, duration: a.duration, url: pb ? `https://player.mux.com/${pb.id}` : null };
    writeJSON(stateFile, state);
    log(`  ✔ asset ${a.id} · playback ${pb?.id} (${pb?.policy}) · ${clock(a.duration || 0)}`);
    if (pb?.policy === "signed") log("  ℹ️ signed: muốn xem phải có token ký bằng Signing Key (backend LMS cấp).");
  }
  links(P);
  if (args.test) log(`\n✔ Bài thử đã lên Mux. Kiểm tra trên dashboard, ổn thì: v2e mux <dir> upload --yes`);
}

function links(P) {
  const state = readJSON(P.p("out", "mux", "state.json"), { videos: {} });
  const rows = Object.entries(state.videos).map(([code, v]) => ({ code, ...v })).sort((a, b) => a.index - b.index);
  let md = `# Mux — danh sách video\n\n| # | Tiêu đề | Thời lượng | Playback ID | Chính sách | Asset ID |\n|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${String(r.index).padStart(2, "0")} | ${r.title} | ${clock(r.duration || 0)} | ${r.playbackId} | ${r.privacy} | ${r.id} |\n`;
  writeText(P.p("out", "mux", "links.md"), md);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeText(P.p("out", "mux", "links.csv"), "﻿index,code,title,duration,playbackId,policy,assetId\n" + rows.map((r) => [r.index, r.code, r.title, clock(r.duration || 0), r.playbackId, r.privacy, r.id].map(esc).join(",")).join("\n") + "\n");
  log(md);
}

export async function mux(args) {
  const P = project(args._[0]);
  const sub = args._[1];
  if (sub === "check") return check();
  if (sub === "upload") return upload(P, args);
  if (sub === "links") return links(P);
  log(`Dùng: v2e mux <dir> check | upload [--policy signed|public] [--test] --yes [--only A1] | links\n\n${HELP}`);
}
