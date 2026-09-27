// `v2e doctor` — kiểm tra môi trường, liệt kê những gì cần cài/tải,
// và chỉ cài khi người dùng xác nhận (hỏi y/N trên terminal, hoặc --yes).
import { existsSync, mkdirSync, renameSync, statSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { REPO, REMOTION_DIR, STATE, config, has, run, saveConfig, writeJSON } from "./util.mjs";

const MODEL_DIR = join(homedir(), ".cache", "video-to-elearning", "models");
const WHISPER_MODEL = "ggml-large-v3-turbo.bin";
const VAD_MODEL = "ggml-silero-v5.1.2.bin";
const URLS = {
  whisper: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL}`,
  vad: `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_MODEL}`,
};
const NEED_FILTERS = ["afftdn", "loudnorm", "silencedetect", "xfade", "acrossfade", "atempo", "deesser", "acompressor", "blackdetect", "freezedetect", "ebur128", "tile"];

/** Find a file already on this Mac (Spotlight) so we never download twice. */
function locate(name, preferred) {
  const cands = [preferred, join(MODEL_DIR, name)].filter(Boolean);
  for (const c of cands) if (existsSync(c) && statSync(c).size > 100_000) return c;
  const ok = (f) => f.endsWith("/" + name) && existsSync(f) && statSync(f).size > 100_000;
  const r = run("mdfind", ["-name", name], { allowFail: true });
  const hit = r.out.split("\n").map((s) => s.trim()).find(ok);
  if (hit) return hit;
  // Spotlight thường bỏ qua file .bin → dò thêm các thư mục hay chứa model
  const roots = [join(REPO, ".."), process.cwd(), join(homedir(), "Downloads"), join(homedir(), "models"), join(homedir(), ".cache"), "/opt/homebrew/share"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const f = run("find", [root, "-maxdepth", "5", "-name", name, "-not", "-path", "*/node_modules/*"], { allowFail: true }).out.split("\n").map((s) => s.trim()).find(ok);
    if (f) return f;
  }
  return null;
}

const gb = (bytes) => (bytes / 1e9).toFixed(1) + " GB";

function checks() {
  const cfg = config();
  const brew = has("brew");
  const items = [];
  const add = (x) => items.push(x);

  // Node
  const major = parseInt(process.versions.node.split(".")[0], 10);
  add({ id: "node", name: "Node.js ≥ 18", required: true, ok: major >= 18, detail: `v${process.versions.node}`,
    fix: { kind: "manual", desc: "Cài Node.js LTS từ https://nodejs.org hoặc `brew install node`" } });

  // Homebrew (chỉ để cài các mục khác)
  add({ id: "brew", name: "Homebrew (trình cài gói macOS)", required: false, ok: brew, detail: brew ? "có" : "chưa có",
    fix: { kind: "manual", desc: "Tự cài theo https://brew.sh (cần mật khẩu máy — người dùng tự chạy)" } });

  // ffmpeg + filters
  const ff = has("ffmpeg") && has("ffprobe");
  let missingFilters = [];
  if (ff) {
    const f = run("ffmpeg", ["-hide_banner", "-filters"], { allowFail: true }).out;
    missingFilters = NEED_FILTERS.filter((n) => !new RegExp(`\\s${n}\\s`).test(f));
  }
  add({ id: "ffmpeg", name: "FFmpeg + FFprobe (cắt, lọc âm)", required: true, ok: ff && missingFilters.length === 0,
    detail: !ff ? "chưa có" : missingFilters.length ? `thiếu filter: ${missingFilters.join(", ")}` : run("ffmpeg", ["-version"]).out.split("\n")[0].slice(0, 40),
    fix: brew ? { kind: "cmd", cmd: ["brew", ff ? "upgrade" : "install", "ffmpeg"], size: "~100 MB", desc: `brew ${ff ? "upgrade" : "install"} ffmpeg` }
              : { kind: "manual", desc: "Cài Homebrew trước, rồi `brew install ffmpeg`" } });

  // whisper.cpp
  const wc = has("whisper-cli");
  let vadSupport = false;
  if (wc) vadSupport = /--vad/.test(run("whisper-cli", ["--help"], { allowFail: true }).err + run("whisper-cli", ["--help"], { allowFail: true }).out);
  add({ id: "whisper-cli", name: "whisper.cpp (chép lời khi KHÔNG có transcript)", required: true, ok: wc && vadSupport,
    detail: !wc ? "chưa có" : vadSupport ? "có, hỗ trợ --vad" : "bản cũ, chưa hỗ trợ --vad",
    fix: brew ? { kind: "cmd", cmd: ["brew", wc ? "upgrade" : "install", "whisper-cpp"], size: "~20 MB", desc: `brew ${wc ? "upgrade" : "install"} whisper-cpp` }
              : { kind: "manual", desc: "Cài Homebrew trước, rồi `brew install whisper-cpp`" } });

  // Whisper model
  const wm = locate(WHISPER_MODEL, cfg.whisperModel);
  add({ id: "whisper-model", name: `Model Whisper large-v3-turbo (tiếng Việt tốt)`, required: true,
    ok: !!wm && cfg.whisperModel === wm, detail: wm ? wm : "chưa có",
    fix: wm ? { kind: "link", path: wm, key: "whisperModel", desc: "Dùng lại file đã có trên máy (không tải)" }
            : { kind: "download", url: URLS.whisper, dest: join(MODEL_DIR, WHISPER_MODEL), key: "whisperModel", size: "1.6 GB", desc: `Tải ${WHISPER_MODEL} từ HuggingFace` } });

  // VAD model
  const vm = locate(VAD_MODEL, cfg.vadModel);
  add({ id: "vad-model", name: "Model VAD Silero (chặn Whisper 'ảo giác' khi im lặng)", required: true,
    ok: !!vm && cfg.vadModel === vm, detail: vm ? vm : "chưa có",
    fix: vm ? { kind: "link", path: vm, key: "vadModel", desc: "Dùng lại file đã có trên máy (không tải)" }
            : { kind: "download", url: URLS.vad, dest: join(MODEL_DIR, VAD_MODEL), key: "vadModel", size: "0.9 MB", desc: `Tải ${VAD_MODEL} từ HuggingFace` } });

  // Remotion deps
  const nm = join(REMOTION_DIR, "node_modules");
  const depsOk = existsSync(join(nm, "remotion")) && existsSync(join(nm, "@remotion", "cli"));
  add({ id: "remotion-deps", name: "Remotion (dựng intro + thumbnail)", required: true, ok: depsOk,
    detail: depsOk ? (lstatSync(nm).isSymbolicLink() ? "có (dùng chung node_modules)" : "có") : "chưa cài",
    fix: { kind: "cmd", cmd: ["npm", "install", "--no-audit", "--no-fund"], cwd: REMOTION_DIR, size: "~250 MB", desc: "npm install trong remotion/" } });

  // Remotion headless browser
  const browserOk = depsOk && existsSync(join(nm, ".remotion", "chrome-headless-shell"));
  add({ id: "remotion-browser", name: "Chrome Headless Shell cho Remotion", required: true, ok: browserOk,
    detail: browserOk ? "có" : "chưa tải",
    fix: { kind: "cmd", cmd: ["npx", "remotion", "browser", "ensure"], cwd: REMOTION_DIR, size: "~90 MB", desc: "npx remotion browser ensure", after: "remotion-deps" } });

  // Disk
  const df = run("df", ["-k", REPO], { allowFail: true }).out.split("\n")[1]?.split(/\s+/);
  const free = df ? parseInt(df[3], 10) * 1024 : 0;
  add({ id: "disk", name: "Dung lượng trống (khuyến nghị ≥ 30 GB / buổi 4h)", required: false, ok: free > 30e9,
    detail: gb(free), fix: { kind: "manual", desc: "Dọn bớt ổ đĩa (video gốc 4h + bản cắt + audio tạm ≈ 15–30 GB)" } });

  return items;
}

function printTable(items) {
  const icon = (i) => (i.ok ? "✅" : i.required ? "❌" : "⚠️ ");
  console.log("\n KIỂM TRA MÔI TRƯỜNG — video-to-elearning\n");
  for (const i of items) console.log(` ${icon(i)} ${i.name.padEnd(58)} ${i.detail}`);
  const todo = items.filter((i) => !i.ok);
  if (!todo.length) {
    console.log("\n 🎉 Môi trường đã sẵn sàng.\n");
    return todo;
  }
  console.log("\n CẦN LÀM:\n");
  todo.forEach((i, n) => {
    const f = i.fix;
    const tag = { cmd: "CÀI", download: "TẢI", link: "LIÊN KẾT", manual: "TỰ LÀM" }[f.kind];
    console.log(` ${n + 1}. [${tag}] ${i.name}\n      → ${f.desc}${f.size ? `  (${f.size})` : ""}`);
  });
  const auto = todo.filter((i) => i.fix.kind !== "manual");
  if (auto.length) console.log(`\n Có ${auto.length} mục làm tự động được. Chạy: node bin/v2e.mjs doctor --install`);
  console.log("");
  return todo;
}

async function confirm(q) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase();
  rl.close();
  return a === "y" || a === "yes" || a === "c" || a === "có";
}

function apply(item) {
  const f = item.fix;
  console.log(`\n▶ ${f.desc}`);
  if (f.kind === "link") {
    saveConfig({ [f.key]: f.path });
  } else if (f.kind === "download") {
    mkdirSync(join(f.dest, ".."), { recursive: true });
    run("curl", ["-L", "--fail", "-C", "-", "--progress-bar", "-o", f.dest + ".part", f.url], { inherit: true });
    renameSync(f.dest + ".part", f.dest);
    saveConfig({ [f.key]: f.dest });
  } else if (f.kind === "cmd") {
    run(f.cmd[0], f.cmd.slice(1), { inherit: true, cwd: f.cwd });
  }
  console.log("  ✔ xong");
}

export async function doctor(args) {
  let items = checks();
  const todo = printTable(items);
  writeJSON(join(STATE, "doctor.json"), { checkedAt: new Date().toISOString(), items });
  if (args.json) console.log(JSON.stringify(items, null, 2));

  if (args.install && todo.length) {
    let auto = todo.filter((i) => i.fix.kind !== "manual");
    if (args.only) {
      const only = String(args.only).split(",");
      auto = auto.filter((i) => only.includes(i.id));
    }
    if (!auto.length) console.log("Không có mục nào cài tự động được — xem mục [TỰ LÀM] ở trên.");
    else {
      const ok = args.yes || (await confirm(` Tiến hành ${auto.length} mục trên? [y/N] `));
      if (!ok) {
        console.log(process.stdin.isTTY ? " Đã huỷ, chưa cài gì." : " Chưa có xác nhận. Hỏi người dùng, nếu đồng ý thì chạy lại với --yes.");
        process.exitCode = 2;
        return;
      }
      // dependency order: deps before browser
      auto.sort((a, b) => (a.fix.after === b.id ? 1 : b.fix.after === a.id ? -1 : 0));
      for (const i of auto) apply(i);
      items = checks();
      printTable(items);
    }
  }
  const ready = items.filter((i) => i.required).every((i) => i.ok);
  writeJSON(join(STATE, "setup.json"), { ready, checkedAt: new Date().toISOString() });
  if (!ready) process.exitCode = process.exitCode || 1;
}
