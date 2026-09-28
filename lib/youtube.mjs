// `v2e youtube`: đăng bộ bài lên YouTube qua YouTube Data API v3 (OAuth của chính người dùng).
//   auth                      → mở trình duyệt để người dùng tự đăng nhập & cấp quyền (token lưu máy, chmod 600)
//   plan  --privacy unlisted  → sinh out/youtube/plan.md + plan.json (tiêu đề, mô tả, tags, thumbnail) để DUYỆT
//   upload --test --yes       → upload 1 bài thử, kiểm tra YouTube có giữ đúng chế độ hiển thị không
//   upload --yes              → upload phần còn lại (chạy lại được, bài đã xong tự bỏ qua) + thumbnail + playlist
//   links                     → out/youtube/links.md + links.csv (tiêu đề + link)
// ⚠️ Dự án Google Cloud CHƯA qua YouTube API audit: mọi video upload bị khoá private vĩnh viễn.
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadEdl } from "./edl.mjs";
import { clock, ffmpeg, log, probeDuration, project, readJSON, run, writeJSON, writeText } from "./util.mjs";

const CFG_DIR = join(homedir(), ".config", "video-to-elearning");
const CLIENT = join(CFG_DIR, "youtube-client.json");
const TOKEN = join(CFG_DIR, "youtube-token.json");
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"; // đủ cho upload, thumbnail, playlist
const API = "https://www.googleapis.com/youtube/v3";
const UP = "https://www.googleapis.com/upload/youtube/v3";

const SETUP_HELP = `Chưa có OAuth client. Làm 1 lần (~10 phút):
  1. https://console.cloud.google.com → tạo project → APIs & Services → Library → bật "YouTube Data API v3"
  2. OAuth consent screen → External → thêm Gmail sở hữu kênh vào "Test users"
  3. Credentials → Create credentials → OAuth client ID → loại "Desktop app" → Download JSON
  4. Lưu file đó thành: ${CLIENT}
  5. Chạy: v2e youtube <dir> auth
  (Muốn public/unlisted: dự án phải qua audit → https://support.google.com/youtube/contact/yt_api_form)`;

function clientCreds() {
  if (!existsSync(CLIENT)) throw new Error(SETUP_HELP);
  const j = readJSON(CLIENT);
  const c = j.installed || j.web;
  if (!c?.client_id) throw new Error(`File ${CLIENT} không đúng định dạng OAuth client (cần loại Desktop app).`);
  return c;
}

// ---------- OAuth (loopback + PKCE) ----------
async function auth() {
  const c = clientCreds();
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(12).toString("hex");
  const { code, redirect } = await new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/cb") { res.end(); return; }
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(ok ? "<h2>Đã cấp quyền. Quay lại terminal.</h2>" : "<h2>Lỗi cấp quyền.</h2>");
      srv.close();
      ok ? resolve({ code: u.searchParams.get("code"), redirect: `http://127.0.0.1:${srv.address()?.port ?? port}/cb` }) : reject(new Error(u.searchParams.get("error") || "Sai state"));
    });
    let port;
    srv.listen(0, "127.0.0.1", () => {
      port = srv.address().port;
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: c.client_id, redirect_uri: `http://127.0.0.1:${port}/cb`, response_type: "code", scope: SCOPE,
        access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state,
      });
      log(`• Mở trình duyệt để đăng nhập kênh YouTube và bấm Cho phép…\n  (nếu không tự mở: ${url})`);
      run("open", [url], { allowFail: true });
    });
    setTimeout(() => { srv.close(); reject(new Error("Hết 5 phút chờ cấp quyền")); }, 300000);
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.client_id, client_secret: c.client_secret || "", redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const t = await r.json();
  if (!t.refresh_token) throw new Error(`Không lấy được token: ${JSON.stringify(t)}`);
  mkdirSync(CFG_DIR, { recursive: true });
  writeJSON(TOKEN, { refresh_token: t.refresh_token, at: new Date().toISOString() });
  chmodSync(TOKEN, 0o600);
  const ch = await api("GET", `${API}/channels?part=snippet&mine=true`);
  log(`✔ Đã kết nối kênh: ${ch.items?.[0]?.snippet?.title || "(không đọc được tên)"}\n  Token lưu tại ${TOKEN} (chỉ máy này).`);
}

let cached = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60000) return cached.tok;
  const c = clientCreds();
  const rt = readJSON(TOKEN, null)?.refresh_token;
  if (!rt) throw new Error("Chưa cấp quyền. Chạy: v2e youtube <dir> auth");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret || "", refresh_token: rt, grant_type: "refresh_token" }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error(`Token hết hạn/bị thu hồi (${t.error}). Chạy lại: v2e youtube <dir> auth`);
  cached = { tok: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return cached.tok;
}

async function api(method, url, body, headers = {}) {
  const r = await fetch(url, {
    method, headers: { Authorization: `Bearer ${await accessToken()}`, ...(body && !(body instanceof Buffer) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? (body instanceof Buffer ? body : JSON.stringify(body)) : undefined,
  });
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!r.ok) throw new Error(`YouTube API ${r.status}: ${j.error?.message || txt.slice(0, 300)}`);
  return j;
}

// ---------- plan ----------
const clean = (s) => s.replace(/\*\*/g, "").replace(/[<>]/g, "").trim();
function metaFor(edl, l, cfg) {
  const code = l.lessonLabel || `Bài ${l.code}`;
  const suffix = cfg.titleSuffix ? ` | ${cfg.titleSuffix}` : "";
  let title = `${code}: ${clean(l.title).replace(/^\(Bonus\)\s*/, "")}${suffix}`;
  if (title.length > 100) title = `${code}: ${clean(l.title).replace(/^\(Bonus\)\s*/, "")}`.slice(0, 100);
  const bullets = (l.bullets || []).map((b) => `• ${clean(b)}`).join("\n");
  const description = [
    `${code} — ${clean(l.title)}`,
    `Khoá học: ${cfg.courseName || edl.course}${edl.parts?.[l.part] ? ` · ${edl.parts[l.part]}` : ""}`,
    bullets ? `\nTrong bài này:\n${bullets}` : "",
    cfg.footer ? `\n${cfg.footer}` : "",
    cfg.hashtags ? `\n${cfg.hashtags}` : "",
  ].filter(Boolean).join("\n").slice(0, 4900);
  return { title, description };
}

function plan(P, edl, args) {
  const cfg = { privacy: "unlisted", playlist: edl.course, titleSuffix: "", footer: "", hashtags: "", tags: [], ...(edl.youtube || {}) };
  if (args.privacy) cfg.privacy = args.privacy;
  if (!["public", "unlisted", "private"].includes(cfg.privacy)) throw new Error("--privacy phải là public | unlisted | private");
  const items = edl.lessons.map((l) => {
    const file = P.p("out", "final", l.file);
    const thumb = P.p("out", "thumb", `${String(l.index).padStart(2, "0")}-${l.code}.png`);
    const { title, description } = metaFor(edl, l, cfg);
    return { code: l.code, index: l.index, file, exists: existsSync(file), thumb: existsSync(thumb) ? thumb : null, title, description,
      duration: existsSync(file) ? clock(probeDuration(file)) : "", tags: cfg.tags };
  });
  const p = { privacy: cfg.privacy, playlist: cfg.playlist, categoryId: cfg.categoryId || "27", language: cfg.language || "vi", items, createdAt: new Date().toISOString() };
  writeJSON(P.p("out", "youtube", "plan.json"), p);
  let md = `# Kế hoạch đăng YouTube — ${edl.course}\n\n- Chế độ hiển thị: **${p.privacy}**\n- Playlist: **${p.playlist}** (cùng chế độ)\n- Danh mục: Giáo dục (27) · Ngôn ngữ: ${p.language}\n- Quota ước tính: ${items.length} lượt upload (hạn mức riêng 100/ngày) + ~${items.length * 100 + 50} đơn vị (thumbnail + playlist, hạn mức 10.000/ngày)\n\n| # | File | Thời lượng | Tiêu đề YouTube | Thumbnail |\n|---|---|---|---|---|\n`;
  for (const it of items) md += `| ${String(it.index).padStart(2, "0")} | ${it.exists ? "✅" : "❌ thiếu"} | ${it.duration} | ${it.title} | ${it.thumb ? "✅" : "—"} |\n`;
  md += `\n## Mẫu mô tả (bài đầu)\n\n\`\`\`\n${items[0]?.description}\n\`\`\`\n`;
  writeText(P.p("out", "youtube", "plan.md"), md);
  log(md);
  log(`→ Duyệt xong: v2e youtube <dir> upload --test --yes (1 bài thử) rồi upload --yes`);
}

// ---------- upload ----------
async function uploadFile(file, meta) {
  const size = statSync(file).size;
  const init = await fetch(`${UP}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": "video/mp4" },
    body: JSON.stringify(meta),
  });
  if (!init.ok) {
    const txt = await init.text();
    if (/uploadLimitExceeded/.test(txt)) throw new Error("Kênh đã chạm GIỚI HẠN UPLOAD TRONG NGÀY của YouTube (uploadLimitExceeded — giới hạn theo kênh, không phải quota API). Chờ ~24 giờ rồi chạy lại `v2e youtube <dir> upload --yes`: bài đã đăng tự bỏ qua.");
    throw new Error(`Khởi tạo upload lỗi ${init.status}: ${txt.slice(0, 300)}`);
  }
  const loc = init.headers.get("location");
  let offset = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(loc, {
        method: "PUT", duplex: "half",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Length": String(size - offset), ...(offset ? { "Content-Range": `bytes ${offset}-${size - 1}/${size}` } : {}) },
        body: createReadStream(file, { start: offset }),
      });
      if (r.ok) return await r.json();
      if (r.status < 500) throw Object.assign(new Error(`Upload lỗi ${r.status}: ${(await r.text()).slice(0, 300)}`), { fatal: true });
    } catch (e) { if (e.fatal) throw e; log(`  ⚠️ mạng lỗi (${e.message}) — thử lại ${attempt}/5`); }
    // hỏi server đã nhận tới đâu để upload tiếp
    const q = await fetch(loc, { method: "PUT", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Range": `bytes */${size}` } });
    if (q.ok) return await q.json();
    const range = q.headers.get("range");
    offset = range ? +range.split("-")[1] + 1 : 0;
    await new Promise((s) => setTimeout(s, 3000 * attempt));
  }
  throw new Error("Upload thất bại sau 5 lần thử");
}

async function ensurePlaylist(state, p) {
  if (state.playlistId || !p.playlist) return state.playlistId;
  const pl = await api("POST", `${API}/playlists?part=snippet,status`, { snippet: { title: p.playlist.slice(0, 150), defaultLanguage: p.language }, status: { privacyStatus: p.privacy } });
  state.playlistId = pl.id;
  return pl.id;
}

async function upload(P, args) {
  const p = readJSON(P.p("out", "youtube", "plan.json"), null);
  if (!p) throw new Error("Chưa có kế hoạch. Chạy: v2e youtube <dir> plan --privacy unlisted");
  if (!args.yes) { log(`Chưa xác nhận. Xem out/youtube/plan.md, hỏi người dùng, rồi chạy lại với --yes.`); process.exitCode = 2; return; }
  const stateFile = P.p("out", "youtube", "state.json");
  const state = readJSON(stateFile, { videos: {} });
  let items = p.items.filter((it) => it.exists);
  if (args.only) { const o = String(args.only).split(","); items = items.filter((it) => o.includes(it.code)); }
  if (args.test) items = items.filter((it) => !state.videos[it.code]).slice(0, 1);
  for (const it of items) {
    if (state.videos[it.code]?.id) { log(`↷ ${it.code} đã đăng — ${state.videos[it.code].url}`); continue; }
    log(`▶ [${String(it.index).padStart(2, "0")}] ${it.title}`);
    const res = await uploadFile(it.file, {
      snippet: { title: it.title, description: it.description, tags: it.tags, categoryId: p.categoryId, defaultLanguage: p.language, defaultAudioLanguage: p.language },
      status: { privacyStatus: p.privacy, selfDeclaredMadeForKids: false, embeddable: true },
    });
    const got = res.status?.privacyStatus;
    state.videos[it.code] = { id: res.id, url: `https://youtu.be/${res.id}`, title: it.title, index: it.index, privacy: got };
    writeJSON(stateFile, state);
    log(`  ✔ ${state.videos[it.code].url} (${got})`);
    if (got !== p.privacy) {
      writeJSON(stateFile, state);
      throw new Error(`YouTube đặt video thành "${got}" thay vì "${p.privacy}" — dự án Google Cloud chưa qua YouTube API audit nên video bị khoá private. DỪNG, không upload tiếp.\n  Nộp audit: https://support.google.com/youtube/contact/yt_api_form`);
    }
    if (it.thumb) {
      try {
        const jpg = P.p("out", "youtube", `thumb-${it.code}.jpg`);
        if (!existsSync(jpg)) ffmpeg(["-i", it.thumb, "-vf", "scale=1280:720", "-q:v", "3", jpg]);
        const { readFileSync } = await import("node:fs");
        await api("POST", `${UP}/thumbnails/set?videoId=${res.id}&uploadType=media`, readFileSync(jpg), { "Content-Type": "image/jpeg" });
        state.videos[it.code].thumb = true;
        log("  ✔ thumbnail");
      } catch (e) { log(`  ⚠️ thumbnail: ${e.message} (kênh cần xác minh số điện thoại để dùng thumbnail tuỳ chỉnh)`); }
    }
    try {
      const pl = await ensurePlaylist(state, p);
      if (pl) { await api("POST", `${API}/playlistItems?part=snippet`, { snippet: { playlistId: pl, resourceId: { kind: "youtube#video", videoId: res.id } } }); log("  ✔ thêm vào playlist"); }
    } catch (e) { log(`  ⚠️ playlist: ${e.message}`); }
    writeJSON(stateFile, state);
  }
  links(P);
  if (args.test) log(`\n✔ Bài thử đã lên đúng chế độ "${p.privacy}". Kiểm tra trên YouTube, ổn thì chạy: v2e youtube <dir> upload --yes`);
}

/** Đặt lại thumbnail cho các video chưa có (YouTube giới hạn tần suất: lỗi 429 → chạy lại sau vài giờ) */
async function retryThumbs(P) {
  const p = readJSON(P.p("out", "youtube", "plan.json"));
  const stateFile = P.p("out", "youtube", "state.json");
  const state = readJSON(stateFile, { videos: {} });
  const { readFileSync } = await import("node:fs");
  let ok = 0, left = 0;
  for (const it of p.items) {
    const v = state.videos[it.code];
    if (!v?.id || v.thumb || !it.thumb) continue;
    const jpg = P.p("out", "youtube", `thumb-${it.code}.jpg`);
    if (!existsSync(jpg)) ffmpeg(["-i", it.thumb, "-vf", "scale=1280:720", "-q:v", "3", jpg]);
    try {
      await api("POST", `${UP}/thumbnails/set?videoId=${v.id}&uploadType=media`, readFileSync(jpg), { "Content-Type": "image/jpeg" });
      v.thumb = true; ok++; log(`  ✔ thumbnail ${it.code}`);
      writeJSON(stateFile, state);
    } catch (e) {
      left++; log(`  ⚠️ ${it.code}: ${e.message.slice(0, 120)}`);
      if (/429|too many/i.test(e.message)) { log("  → YouTube đang giới hạn tần suất, dừng. Chạy lại lệnh này sau vài giờ."); left += p.items.filter((x) => state.videos[x.code]?.id && !state.videos[x.code].thumb).length - 1; break; }
    }
  }
  log(`✔ Đặt thêm ${ok} thumbnail · còn ${left} bài chưa có thumbnail`);
}

function links(P) {
  const state = readJSON(P.p("out", "youtube", "state.json"), { videos: {} });
  const rows = Object.entries(state.videos).map(([code, v]) => ({ code, ...v })).sort((a, b) => a.index - b.index);
  let md = `# Link YouTube\n\n${state.playlistId ? `Playlist: https://www.youtube.com/playlist?list=${state.playlistId}\n\n` : ""}| # | Tiêu đề | Link | Hiển thị |\n|---|---|---|---|\n`;
  for (const r of rows) md += `| ${String(r.index).padStart(2, "0")} | ${r.title} | ${r.url} | ${r.privacy} |\n`;
  writeText(P.p("out", "youtube", "links.md"), md);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeText(P.p("out", "youtube", "links.csv"), "\ufeffindex,code,title,url,privacy\n" + rows.map((r) => [r.index, r.code, r.title, r.url, r.privacy].map(esc).join(",")).join("\n") + "\n");
  log(md);
}

export async function youtube(args) {
  const P = project(args._[0]);
  const sub = args._[1];
  mkdirSync(P.p("out", "youtube"), { recursive: true });
  if (sub === "auth") return auth();
  if (sub === "plan") return plan(P, loadEdl(P), args);
  if (sub === "upload") return upload(P, args);
  if (sub === "links") return links(P);
  if (sub === "thumbs") return retryThumbs(P);
  log(`Dùng: v2e youtube <dir> auth | plan [--privacy unlisted|public|private] | upload --test --yes | upload --yes | thumbs | links\n\n${SETUP_HELP}`);
}
