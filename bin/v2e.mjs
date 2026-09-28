#!/usr/bin/env node
// video-to-elearning CLI — video dài → bộ bài giảng e-learning + intro + thumbnail.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanAudio } from "../lib/audio.mjs";
import { doctor } from "../lib/doctor.mjs";
import { edlCheck } from "../lib/edl.mjs";
import { exportAll } from "../lib/export.mjs";
import { init, prepare } from "../lib/prepare.mjs";
import { qa } from "../lib/qa.mjs";
import { render } from "../lib/render.mjs";
import { thumbs } from "../lib/thumbs.mjs";
import { transcribe } from "../lib/transcribe.mjs";
import { youtube } from "../lib/youtube.mjs";
import { STATE, parseArgs, project, readJSON } from "../lib/util.mjs";

const HELP = `
v2e — Video dài → bộ bài giảng E-learning

  doctor [--install] [--yes] [--only id,id]   Kiểm tra môi trường; --install cài/tải (hỏi xác nhận)
  init <dir> --video f [--transcript f] [--zoom-json f] [--title "..."]
  prepare <dir> [--every 60] [--no-scenes]    Tách audio, đo lặng/độ to, frame, mốc đổi cảnh
  transcribe <dir> [--whisper] [--no-vad]     Transcript → work/cues.json, bymin.txt, flags.md
      ── Claude viết PLAN.md → NGƯỜI DÙNG DUYỆT → viết edl.json ──
  edl <dir> [--snap] [--window 5]             Kiểm tra edl.json; --snap dời ranh giới bài vào chỗ ngắt hơi
  clean-audio <dir> [--sample] [--preset light|standard|strong]
  render <dir> --sample [MÃ] | --only A1,A2 | --all | --mistakes  [--no-intro] [--force]
  thumbs <dir> [--prompts] [--only A1]        Thumbnail; --prompts = câu lệnh tạo ảnh nền + ảnh ref
  qa <dir> [--only A1]                        Kiểm tra chất lượng file final
  export <dir>                                curriculum.json/.csv + phụ đề .srt từng bài
  youtube <dir> auth|plan|upload|links        Đăng lên YouTube (plan → duyệt → upload --test --yes → upload --yes)
  status <dir>                                Dự án đang ở bước nào, bước tiếp theo là gì
`;

function status(args) {
  const P = project(args._[0]);
  const f = (x) => existsSync(P.p(x));
  const n = (d) => (existsSync(P.p(d)) ? readdirSync(P.p(d)).filter((x) => !x.startsWith(".") && !x.endsWith(".part.mp4")).length : 0);
  const steps = [
    ["1 init", f("work/project.json"), `v2e init <dir> --video …`],
    ["2 prepare", f("work/.prepared"), `v2e prepare "${args._[0]}"`],
    ["3 transcribe", f("work/cues.json"), `v2e transcribe "${args._[0]}"`],
    ["4 clean-audio (chạy nền khi viết PLAN)", f("work/audio-clean.m4a"), `v2e clean-audio "${args._[0]}" --sample → nghe → v2e clean-audio "${args._[0]}"`],
    ["5 PLAN.md (duyệt 1)", f("PLAN.md"), "Claude viết PLAN.md từ work/bymin.txt + work/flags.md → người dùng duyệt"],
    ["6 edl.json", f("edl.json"), "Chuyển PLAN đã duyệt thành edl.json → v2e edl <dir> --snap"],
    ["7 bài mẫu (duyệt 2)", n("out/sample") > 0, `v2e render "${args._[0]}" --sample`],
    ["8 render all", n("out/final") > 0, `v2e render "${args._[0]}" --all`],
    ["9 thumbnails", n("out/thumb") > 0, `v2e thumbs "${args._[0]}" [--prompts]`],
    ["10 QA", f("out/qa-report.md"), `v2e qa "${args._[0]}"`],
    ["11 export (duyệt 3)", f("out/curriculum.json"), `v2e export "${args._[0]}"`],
  ];
  const setup = readJSON(join(STATE, "setup.json"), null);
  console.log(`\n Môi trường: ${setup?.ready ? "✅ sẵn sàng" : "❌ chưa kiểm tra/thiếu → v2e doctor"}\n`);
  let next = null;
  for (const [name, done, cmd] of steps) {
    console.log(` ${done ? "✅" : "⬜"} ${name}`);
    if (!done && !next) next = cmd;
  }
  console.log(next ? `\n ▶ Bước tiếp: ${next}\n` : "\n 🎉 Hoàn tất.\n");
}

const CMDS = { doctor, init, prepare, transcribe, edl: edlCheck, "clean-audio": cleanAudio, render, thumbs, qa, export: exportAll, youtube, status };

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help" || !CMDS[cmd]) {
  console.log(HELP);
  process.exit(cmd && !CMDS[cmd] && cmd !== "help" && cmd !== "--help" ? 1 : 0);
}
try {
  const args = parseArgs(rest);
  if (cmd !== "doctor" && cmd !== "status" && !args._[0]) throw new Error(`Thiếu <dir>. Xem: v2e help`);
  await CMDS[cmd](args);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
