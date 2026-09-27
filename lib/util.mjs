// Shared helpers: process execution, time formatting, project paths, JSON io.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STATE = join(REPO, "state");
export const REMOTION_DIR = join(REPO, "remotion");

/** Run a command; throws on non-zero exit unless opts.allowFail. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    stdio: opts.inherit ? "inherit" : "pipe",
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
  });
  if (r.error && !opts.allowFail) throw r.error;
  if (r.status !== 0 && !opts.allowFail) {
    const tail = (r.stderr || "").split("\n").slice(-15).join("\n");
    throw new Error(`${cmd} ${args.slice(0, 6).join(" ")} … failed (exit ${r.status})\n${tail}`);
  }
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

export const has = (bin) => run("/bin/sh", ["-c", `command -v ${bin}`], { allowFail: true }).code === 0;

export const ffmpeg = (args, opts) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], opts);

export function probeDuration(file) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(r.out.trim());
}

// ---------- time ----------
const p2 = (n) => String(n).padStart(2, "0");
/** 3725.4 -> "01:02:05" */
export const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
};
/** 3725.4 -> "01:02:05.400" */
export const clockMs = (sec) => {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const s = Math.floor(ms / 1000);
  return `${clock(s)}.${String(ms % 1000).padStart(3, "0")}`;
};
/** SRT style "01:02:05,400" */
export const srtTime = (sec) => clockMs(sec).replace(".", ",");
/** Accepts 125.3 | "125.3" | "02:05" | "00:02:05.300" | "00:02:05,300" */
export function parseTime(v) {
  if (typeof v === "number") return v;
  const t = String(v).trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Không đọc được thời gian: ${v}`);
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}

// ---------- text ----------
export const slug = (s, max = 46) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");

// ---------- json ----------
export const readJSON = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);
export const writeJSON = (f, data) => {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
};
export const writeText = (f, s) => {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, s);
};

// ---------- config (tool paths chosen by doctor) ----------
export const CONFIG_FILE = join(STATE, "config.json");
export const config = () => readJSON(CONFIG_FILE, {});
export const saveConfig = (patch) => writeJSON(CONFIG_FILE, { ...config(), ...patch });

// ---------- project layout ----------
export function project(dir) {
  const root = resolve(dir);
  const p = (...x) => join(root, ...x);
  return {
    root,
    input: p("input"),
    work: p("work"),
    out: p("out"),
    brand: p("brand"),
    edl: p("edl.json"),
    brief: p("brief.md"),
    plan: p("PLAN.md"),
    source: () => {
      const meta = readJSON(p("work", "project.json"), null);
      if (!meta?.source) throw new Error(`Chưa init dự án (thiếu work/project.json) tại ${root}`);
      return meta.source;
    },
    meta: () => readJSON(p("work", "project.json"), {}),
    p,
  };
}

export function ensureDirs(...dirs) {
  for (const d of dirs) mkdirSync(d, { recursive: true });
}

export function log(...a) {
  console.log(...a);
}

/** Parse "--key value" / "--flag" style args. Positional args go to _. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=");
      if (inline !== undefined) out[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
