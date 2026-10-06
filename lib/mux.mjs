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
  if (!r.ok) {
    const msg = j.error?.messages?.join("; ") || txt.slice(0, 300);
    if (/Free plan is limited/i.test(msg)) throw new Error(`Tài khoản Mux đang ở GÓI FREE (tối đa 10 video). Người dùng cần tự nâng cấp gói trả phí trong Mux Dashboard → Billing, rồi chạy lại upload (bài đã lên tự bỏ qua). Chi tiết: ${msg}`);
    throw new Error(`Mux API ${r.status} ${path}: ${msg}`);
  }
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

const slugify = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Thông tin phải được người dùng XÁC NHẬN trước mỗi batch */
function batchInfo(edl, args) {
  const m = edl.mux || {};
  const course = m.courseName || edl.youtube?.courseName || edl.course;
  return {
    policy: args.policy || m.policy, // KHÔNG có mặc định — bắt buộc chọn rõ
    course,
    group: m.group || slugify(course),
    owner: m.creatorId || "",
    quality: m.videoQuality || "basic",
  };
}

async function upload(P, args) {
  const edl = loadEdl(P);
  const info = batchInfo(edl, args);
  const stateFile = P.p("out", "mux", "state.json");
  const state = readJSON(stateFile, { videos: {} });
  let list = edl.lessons.filter((l) => existsSync(P.p("out", "final", l.file)));
  if (args.only) { const o = String(args.only).split(","); list = list.filter((l) => o.includes(l.code)); }
  if (args.test) list = list.filter((l) => !state.videos[l.code]).slice(0, 1);
  const todo = list.filter((l) => !state.videos[l.code]?.playbackId);

  // ⛔ Cổng xác nhận cho MỖI batch: in thông tin quan trọng; chỉ chạy khi có --policy rõ ràng + --yes
  const pol = info.policy ? `${info.policy.toUpperCase()}${info.policy === "public" ? "  (ai có link cũng xem được)" : "  (cần token do website cấp)"}` : "❌ CHƯA CHỌN — thêm --policy signed|public hoặc edl.mux.policy";
  log(`\n XÁC NHẬN TRƯỚC KHI ĐẨY LÊN MUX
  • Chính sách phát : ${pol}
  • Chủ sở hữu      : ${info.owner || "(trống — nên đặt edl.mux.creatorId: coachio / mã đối tác)"}
  • Nhóm (khoá)     : ${info.group}
  • Tên khoá        : ${info.course}
  • Chất lượng      : ${info.quality}
  • Số video        : ${todo.length} mới${list.length - todo.length ? ` · ${list.length - todo.length} đã có (bỏ qua)` : ""}
${todo.map((l) => `      ${String(l.index).padStart(2, "0")} ${l.code} · ${edl.parts?.[l.part] || ""} · ${l.title.replace(/\*\*/g, "")}`).join("\n")}\n`);
  if (!info.policy) { process.exitCode = 2; return; }
  if (!["signed", "public"].includes(info.policy)) throw new Error("--policy phải là signed | public");
  if (!args.yes) { log(" Chưa xác nhận. Gửi bảng trên cho người dùng; chỉ khi họ đồng ý mới chạy lại với --yes."); process.exitCode = 2; return; }

  Object.assign(state, { policy: info.policy, group: info.group, course: info.course, owner: info.owner });
  for (const l of todo) {
    const title = `${l.lessonLabel || `Bài ${l.code}`}: ${l.title.replace(/\*\*/g, "")}`.slice(0, 250);
    const category = (edl.parts?.[l.part] || l.part || "").replace(/^PHẦN\s+/, "");
    log(`▶ [${String(l.index).padStart(2, "0")}] ${title}`);
    const up = await api("POST", "/uploads", {
      cors_origin: "*",
      new_asset_settings: {
        playback_policies: [info.policy],
        video_quality: info.quality,
        // passthrough ≤255 ký tự: nhóm + danh mục + mã bài → gom/lọc khi quản lý (v2e mux catalog)
        passthrough: JSON.stringify({ g: info.group, cat: category, code: l.code, i: l.index }).slice(0, 255),
        meta: { title, external_id: `${info.group}:${l.code}`.slice(0, 128), ...(info.owner ? { creator_id: info.owner } : {}) },
      },
    });
    await putFile(up.url, P.p("out", "final", l.file));
    log("  • đã tải file lên, chờ Mux xử lý…");
    const a = await waitReady(up.id);
    const pb = a.playback_ids?.find((x) => x.policy === info.policy) || a.playback_ids?.[0];
    state.videos[l.code] = { id: a.id, playbackId: pb?.id, privacy: pb?.policy, title, category, index: l.index, duration: a.duration, url: pb ? `https://player.mux.com/${pb.id}` : null };
    writeJSON(stateFile, state);
    log(`  ✔ asset ${a.id} · playback ${pb?.id} (${pb?.policy}) · ${clock(a.duration || 0)}`);
  }
  links(P);
  if (args.test) log(`\n✔ Bài thử đã lên Mux. Kiểm tra, ổn thì xác nhận batch còn lại.`);
}

/** Danh mục toàn bộ video trên Mux, gom theo chủ sở hữu → nhóm → danh mục (đọc meta/passthrough) */
async function catalog(P) {
  const all = [];
  for (let page = 1; page < 100; page++) {
    const batch = await api("GET", `/assets?limit=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const rows = all.map((a) => {
    let pt = {};
    try { pt = JSON.parse(a.passthrough || "{}"); } catch {}
    const ext = a.meta?.external_id || "";
    return {
      owner: a.meta?.creator_id || "(không rõ)", group: pt.g || ext.split(":")[0] || "(chưa phân nhóm)", cat: pt.cat || "", code: pt.code || ext.split(":")[1] || "", i: pt.i ?? 999,
      title: a.meta?.title || "(không tên)", dur: a.duration || 0, status: a.status, policy: a.playback_ids?.[0]?.policy || "", pb: a.playback_ids?.[0]?.id || "",
    };
  }).sort((x, y) => `${x.owner}/${x.group}`.localeCompare(`${y.owner}/${y.group}`) || x.i - y.i);
  let md = `# Mux — danh mục video (${all.length} video)\n\n`;
  const key = (r) => `${r.owner} / ${r.group}`;
  for (const k of [...new Set(rows.map(key))]) {
    const rs = rows.filter((r) => key(r) === k);
    md += `## ${k} — ${rs.length} video · ${clock(rs.reduce((n, r) => n + r.dur, 0))}\n\n| Danh mục | Mã | Tiêu đề | Thời lượng | Chính sách | Trạng thái | Playback ID |\n|---|---|---|---|---|---|---|\n`;
    for (const r of rs) md += `| ${r.cat} | ${r.code} | ${r.title} | ${clock(r.dur)} | ${r.policy} | ${r.status} | ${r.pb} |\n`;
    md += "\n";
  }
  writeText(P.p("out", "mux", "catalog.md"), md);
  log(md);
}

function links(P) {
  const state = readJSON(P.p("out", "mux", "state.json"), { videos: {} });
  const rows = Object.entries(state.videos).map(([code, v]) => ({ code, ...v })).sort((a, b) => a.index - b.index);
  let md = `# Mux — danh sách video\n\n| # | Tiêu đề | Thời lượng | Playback ID | Chính sách | Asset ID |\n|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${String(r.index).padStart(2, "0")} | ${r.title} | ${clock(r.duration || 0)} | ${r.playbackId} | ${r.privacy} | ${r.id} |\n`;
  writeText(P.p("out", "mux", "links.md"), md);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeText(P.p("out", "mux", "links.csv"), "﻿index,code,title,duration,playbackId,policy,assetId\n" + rows.map((r) => [r.index, r.code, r.title, clock(r.duration || 0), r.playbackId, r.privacy, r.id].map(esc).join(",")).join("\n") + "\n");
  writeEmbeds(P, state, rows);
  log(md);
}

/** Mã nhúng iframe (giống nút Embed trên Mux Dashboard) + metadata cho Mux Data. Signed → website phải nối thêm ?token=… */
export function embedCode(playbackId, { title = "", code = "", group = "" } = {}) {
  const q = new URLSearchParams({ "metadata-video-title": title, "metadata-video-id": code, ...(group ? { "metadata-video-series": group } : {}) });
  return `<iframe src="https://player.mux.com/${playbackId}?${q}" style="width: 100%; border: none; aspect-ratio: 16/9;" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`;
}

function writeEmbeds(P, state, rows) {
  const items = rows.filter((r) => r.playbackId).map((r) => ({ ...r, embed: embedCode(r.playbackId, { title: r.title, code: r.code, group: state.group }) }));
  let md = `# Mux — mã nhúng (${items.length} video)\n\nDán nguyên khối \`<iframe>\` vào trang bài học. Video tự co theo chiều rộng khung, tỉ lệ 16:9.${state.policy === "signed" ? "\n\n⚠️ Chính sách SIGNED: website phải thêm `&token=<JWT>` vào src (ký bằng Mux Signing Key)." : ""}\n\n`;
  for (const r of items) md += `## ${String(r.index).padStart(2, "0")}. ${r.title} (${clock(r.duration || 0)})\n\n\`\`\`html\n${r.embed}\n\`\`\`\n\n`;
  writeText(P.p("out", "mux", "embed-codes.md"), md);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeText(P.p("out", "mux", "embed-codes.csv"), "﻿index,code,title,duration,playbackId,embed\n" + items.map((r) => [r.index, r.code, r.title, clock(r.duration || 0), r.playbackId, r.embed].map(esc).join(",")).join("\n") + "\n");
  // trang xem thử: mở bằng trình duyệt để kiểm tra mọi mã nhúng chạy
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${state.course || "Mux embeds"}</title>
<style>body{font-family:system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;background:#f4f5f7;color:#0f2547}h1{font-size:22px}.card{background:#fff;border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}h2{font-size:16px;margin:0 0 10px}textarea{width:100%;height:70px;font:12px monospace;margin-top:8px}</style></head><body>
<h1>${state.course || ""} — ${items.length} video</h1>
${items.map((r) => `<div class="card"><h2>${String(r.index).padStart(2, "0")}. ${r.title} · ${clock(r.duration || 0)}</h2>${r.embed}<textarea readonly onclick="this.select()">${r.embed.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea></div>`).join("\n")}
</body></html>`;
  writeText(P.p("out", "mux", "embed-preview.html"), html);
}

export async function mux(args) {
  const P = project(args._[0]);
  const sub = args._[1];
  if (sub === "check") return check();
  if (sub === "upload") return upload(P, args);
  if (sub === "links") return links(P);
  if (sub === "catalog") return catalog(P);
  log(`Dùng: v2e mux <dir> check | upload --policy signed|public [--test] [--yes] [--only A1] | links | catalog\n\n${HELP}`);
}
