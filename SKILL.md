---
name: video-to-elearning
description: Biến video dài 1–4 giờ (Zoom/workshop/livestream/screencast) thành bộ bài giảng e-learning — transcript, lập PLAN chia phần/bài để duyệt, cắt đoạn thừa (chuyển cảnh mượt + SFX), tua 2x khoảng lặng, bỏ đoạn nói nhầm, khử ồn + chuẩn âm lượng, intro Remotion, thumbnail theo brand (HTML/Remotion template, ảnh chụp thật hoặc nền AI), QA và xuất curriculum + phụ đề. Dùng khi người dùng gửi video/folder video dài và muốn "cắt thành bài giảng", "làm khoá học", "chia chương", "e-learning", "cắt video buổi học/bootcamp/workshop", "làm thumbnail bài học", "bỏ đoạn thừa/tiếng ồn", kể cả khi không nhắc tên skill.
---

# video-to-elearning

CLI: `node ~/.claude/skills/video-to-elearning/bin/v2e.mjs <command>` (written `v2e` below).
Full process + rationale: [docs/QUY-TRINH.md](docs/QUY-TRINH.md). Thumbnails: [docs/THUMBNAIL.md](docs/THUMBNAIL.md).
Talk to the user in Vietnamese. The rules below are in English on purpose — follow them exactly.

## ⛔ NON-NEGOTIABLE GATES — read before doing anything

You MUST stop and wait for explicit user approval at each gate. Never skip, merge, or "assume approval" for any of them:

| Gate | What the user approves | Nothing after this may run before approval |
|---|---|---|
| G0 | Environment install list (`v2e doctor`) | installs / downloads |
| G1 | `PLAN.md` (lessons, cuts, kept mistakes) | `edl.json`, any render |
| G2 | **Brand kit + 1 test banner** (only when brand is new / not yet approved) | thumbnails for all lessons |
| G3 | Full thumbnail set (overview sheet) | sample video |
| G4 | 1 sample lesson video | batch render (`--all`) |
| G5 | QA report + deliverables | "done" |

If the user explicitly says to continue past a gate unattended (e.g. "chạy hàng loạt để tôi đi ngủ"), you may proceed, but you MUST still self-check the sample (Step 6 checklist) before starting the batch, and report what you checked.

## 0. Environment (first use, or `state/setup.json` not `ready`) — GATE G0

1. Run `v2e doctor` and show the table to the user.
2. For every ❌ item, list **what will be installed/downloaded, size, source** (from the output). `[LIÊN KẾT]` = reuse an existing file, no download.
3. **Ask for confirmation. Install ONLY after an explicit yes**: `v2e doctor --install --yes` (or `--only id1,id2`). NEVER install without consent.
4. `[TỰ LÀM]` items (Homebrew, Node) need the user's password → give instructions, do not run them.
5. VAD model is only required when there is NO transcript (Zoom VTT/SRT). If a transcript exists, you may continue without it.

## 1. Intake

- Ask once, in one message, for anything missing: video path, transcript (Zoom VTT is best), course name / session number, how to treat sales segments, lesson length. Empty = defaults in `templates/brief.template.md`.
- Project dir default: next to the video, named `v2e-<session-name>`.
- `v2e init <dir> --video <f> [--transcript <f>] [--zoom-json <f>] --title "…"` → fill `brief.md`.
- Add session-specific mishearings to `work/glossary.json` (`prompt` + `replace`) BEFORE `v2e transcribe`.

## 2. Analysis (automatic)

- `v2e prepare <dir>` → media, 16k audio, loudness, **silences measured from audio** (source of truth for cuts), frames + contact sheets, scene changes.
- Run in background: `v2e clean-audio <dir> --sample` → send the 3 before/after pairs (convert to .m4a) → user picks preset (default `standard`) → run `v2e clean-audio <dir> --preset …` in background while you write the PLAN.
- `v2e transcribe <dir>` → `work/cues.json`, `work/bymin.txt`, `work/flags.md`.
- Long transcripts (>1000 cues): split the reading across parallel sub-agents by cue range; each returns a topic map with cue numbers, cut candidates, mistakes, sales segments, mishearings. You still own the final PLAN.

## 3. PLAN.md — GATE G1

Read ALL of `work/bymin.txt` (or the sub-agent maps), `work/flags.md`, `work/frames/contact-sheet-*.jpg`, `brief.md`. Write `PLAN.md` using `templates/PLAN.template.md`:
- Parts/lessons of 5–12 min (>15 split, <3 merge). Title = verb + outcome. 2–3 content bullets per lesson.
- Boundaries at topic transitions, aligned with scene changes when possible.
- List cut segments + a **mistakes table (M1, M2…)** with keep/cut proposal. Demo errors that teach debugging → propose KEEP.
- Off-topic but valuable segments → Bonus lessons at the end.
- ⚠️ Flag any on-screen credentials/passwords/API keys → mandatory cut.
Send the PLAN summary + open questions, then **STOP and wait**.

## 4. edl.json

Convert the approved PLAN into `edl.json` (`templates/edl.example.json`). Build it from **cue numbers** (read start/end from `work/cues.json`), not hand-typed times. Include `lessons[]`, `mistakes[]` (drop true/false per user decision), `parts` (short labels — they appear in pills), `brand`, `sfx`, `thumbMode`.
Run `v2e edl <dir> --snap` (after clean-audio finished) then `v2e edl <dir>` until `✔ edl.json hợp lệ`.
`--snap` moves lesson boundaries AND every dropped segment into the nearest pause — a cut starts slightly EARLIER and ends slightly LATER so no sentence is chopped. If it warns "không có chỗ ngắt hơi", move the boundary or use `--window 15`.

## 5. Brand kit + test banner — GATE G2 (MANDATORY the first time a brand is used)

**Do NOT render the full thumbnail set until the user has approved one banner with their brand.**

Check `<project>/brand/`. If this is a new brand, or the user has not approved this brand before (no `brand/APPROVED` file):
1. Ask the user — in ONE message — for:
   - **Logo** (PNG, transparent background preferred; horizontal version for top-left).
   - **Primary colors** (hex): ink/navy (text), accent 1 (pill/underline), accent 2 (highlight word, lesson chip). Offer to extract them from their logo or website if they don't know.
   - **Kicker text** (e.g. "BỘ VIDEO E-LEARNING") and course name.
   - Style reference (optional): an existing banner/thumbnail they like.
2. Save logo → `brand/logo.png`; colors → `edl.json › brand.ink/orange/blue`.
3. Render ONE test banner: `v2e thumbs <dir> --only <best-lesson>` and send it (full size).
4. **STOP and wait for approval.** Iterate on feedback. When approved, `touch brand/APPROVED`.
Repeat: never batch thumbnails with an unapproved brand.

## 6. Thumbnails — GATE G3

The thumbnail is an HTML/React (Remotion) template — text is always rendered by code (correct Vietnamese diacritics, consistent set, instant re-render).
- **Default mode `thumbMode: "screenshot"`**: code-drawn brand background (orange/blue geometry, dots) + a real screenshot of the lesson inside a tilted device frame + logo + title. Free, accurate per lesson.
  - Pick the frame per lesson: extract 4 candidates per lesson (20/40/60/80 %), tile them, look, choose the most visual/representative one (3D model, result screen, finished app) → set `thumbFrameAt` (seconds). Avoid slides with lots of text, empty screens, login pages.
- **Mode "AI background"**: see `docs/THUMBNAIL.md` (`v2e thumbs --prompts`, save to `brand/thumb-bg/<CODE>.png`).
- `thumbTitle` ≤ 6 words with ONE highlighted keyword in `**…**`. Part labels short (pill must stay on one line).
- `v2e thumbs <dir>` → build an overview sheet (`ffmpeg … tile=4x7`) + send 2 full-size samples. **STOP and wait for approval.**

## 7. Sample lesson — GATE G4

`v2e render <dir> --sample <CODE>` — pick a lesson that contains at least one dropped segment. Self-check BEFORE sending:
- [ ] Look at frames right before/after each cut (`out/segmaps/<CODE>.json` joins) — dip to black is short, no sentence chopped.
- [ ] Loudness ≈ −16 LUFS (`ffmpeg -af ebur128`), SFX audible but under the voice.
- [ ] Intro → lesson crossfade + whoosh OK; file size reasonable.
Send the sample. **STOP and wait for approval** (unless the user explicitly pre-approved an unattended batch — then report the self-check and continue).

## 8. Batch render

`v2e render <dir> --all` in background (resumable; finished lessons are skipped). Also exports `out/review-mistakes/` (`-BO` = dropped, `-GIU` = kept).
Encoding defaults (small but clean for screen recordings): H.264 `crf 23`, `preset slow`, AAC 128k, faststart. Override with `edl.crf` / `edl.preset`.
Cut transitions: 0.25 s dip + audio fade at every dropped segment (`edl.cutFade`), SFX from `edl.sfx.cut` (whoosh), intro SFX `edl.sfx.intro`, volume `edl.sfx.volume` (0.45). Pick SFX from the user's library if they have one (prefer a soft whoosh ~1 s).

## 9. QA + delivery — GATE G5

`v2e qa <dir>` → fix ❌ lessons. `v2e export <dir>` → `out/curriculum.json/.csv`, `out/captions/*.srt`. Report: lesson count, original → final duration, total size, issues to review, output folders.

## Hard rules (repeat — do not violate)

- NEVER modify/delete anything in `input/` or the original video.
- NEVER cut before G1. NEVER batch thumbnails before G2/G3. NEVER batch render before G4 (or explicit unattended approval + self-check).
- Cuts/speed-ups are based on silences measured from audio, NOT on Whisper timestamps.
- Vietnamese text on thumbnails/intros is ALWAYS rendered by Remotion; AI images must never contain title text.
- Always cut segments that show credentials, passwords, API keys.
- `v2e status <dir>` tells where a project is; use it when resuming in a new session.
