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
Encoding defaults (fast + clean for screen recordings): H.264 `crf 23`, `preset medium`, AAC 128k, faststart. Override with `edl.crf` / `edl.preset`.
Background: black letterbox is replaced by a macOS wallpaper (`edl.frame.background`, from `assets/frame/`); auto-crops the recording's own black borders first. NO window chrome (kept simple for speed).
Cut transitions: at every dropped segment the outgoing scene's audio fades down, video crossfades (`edl.transition`), and a whoosh SFX plays (`edl.sfx.cut`) so viewers feel the previous scene ended. Every cut is logged to `out/cut-log.md` / `.csv` with the lesson number, timestamp-in-video, removed source range, and reason — so the user can point to "video 12, cut at 07:23".

## 9. QA + delivery — GATE G5

`v2e qa <dir>` → fix ❌ lessons. `v2e export <dir>` → `out/curriculum.json/.csv`, `out/captions/*.srt`. Report: lesson count, original → final duration, total size, issues to review, output folders.

## 10. Publish to YouTube (optional — only when the user asks)

`v2e youtube <dir> auth | plan | upload | links` — YouTube Data API v3 with the USER's own OAuth client (no extra npm deps).
1. One-time setup is done BY THE USER (never create accounts or enter credentials for them): Google Cloud project → enable "YouTube Data API v3" → OAuth consent screen (External, add their Gmail as test user) → OAuth client ID type **Desktop app** → save JSON as `~/.config/video-to-elearning/youtube-client.json`. Then `v2e youtube <dir> auth` opens the browser; the user signs in and clicks Allow. Token is stored locally (chmod 600).
2. `v2e youtube <dir> plan --privacy unlisted|public|private` → `out/youtube/plan.md` (titles ≤100 chars, description with bullets, tags, playlist, quota estimate). **Show it and WAIT for explicit confirmation** — uploading publishes to the user's channel.
3. `v2e youtube <dir> upload --test --yes` uploads ONE lesson first and verifies YouTube kept the requested privacy. ⚠️ Projects that have NOT passed the YouTube API audit get every upload **locked private forever** (cannot be changed in Studio, no appeal — must re-upload). The tool stops if that happens; point the user to https://support.google.com/youtube/contact/yt_api_form . Alternative without audit: upload via YouTube Studio or a verified service (e.g. Upload-Post, if connected).
4. After the test is confirmed: `v2e youtube <dir> upload --yes` (resumable; done lessons skipped) + thumbnails (needs phone-verified channel) + playlist in lesson order. Captions are NOT uploaded by default (captions.insert costs 400 units each).
5. Report `out/youtube/links.md` / `links.csv` (index, title, URL, privacy, playlist link).
Quota (2026): videos.insert has its own bucket of 100 uploads/day; thumbnails.set 50, playlistItems.insert 50, playlists.insert 50 from the 10,000 units/day pool.

## Lessons learned (from real production — follow them)

**Speed first.** The user values fast production. Skip anything slow that is not clearly needed. Preview layout/look decisions with STILL IMAGES (Remotion `Scene` still, `ffmpeg -frames:v 1`) before rendering any video.

**Layout = "A + C" (default, approved):**
- Auto-detect and crop the recording's own black borders per lesson (`detectCrop`, union of 10 samples → never cuts content).
- Content ≈16:9 → fills the 1920×1080 frame (no border, sharpest text).
- Content 4:3 → contained on a macOS wallpaper (`edl.frame.background`) instead of black bars.
- ❌ Do NOT build window-chrome mockups (Safari frame) or floating-window-with-shadow layouts unless the user asks: slower, smaller text, and rejected by the user.

**Cuts must feel intentional, never abrupt.** Every dropped segment = a transition: outgoing audio fades down (~0.8 s), video crossfades (`edl.transition`), a whoosh SFX plays. Cut starts snap slightly EARLIER into a pause, ends slightly LATER. Every transition is logged in `out/cut-log.md/.csv` (video number, time in video, removed source range, reason) so the user can say "video 12, cut at 07:23".

**Intro = the APPROVED THUMBNAIL of that lesson** (`out/thumb/NN-CODE.png`), shown 4 s with fade in/out + shared intro music (`assets/music/intro-music.m4a`, −18 LUFS, fades) + intro whoosh, then concatenated to the lesson WITHOUT re-encoding (`-c copy`). Never use a separate/old intro template: the user approved the thumbnails, the video must open with exactly those (a stale Antigravity intro template once slipped through — never again). Render thumbnails BEFORE the batch. Same music for every video unless the user provides another (`edl.introMusic`).

**Order the user wants:** PLAN → thumbnails (approve) → 1 sample video (approve) → batch render unattended (they often go to sleep — run to completion, then QA + export).

**Technical pitfalls (already fixed — do not reintroduce):**
- Never feed an infinite input (`-loop 1` image) to a filter graph unless the overlay uses `shortest=1` with the video as the finite stream; otherwise ffmpeg never stops.
- Measure loudness with `ebur128=peak=true:framelog=quiet` (fast). Never measure long audio with `loudnorm` (it resamples to 192 kHz — minutes per hour of audio) and never let ebur128 print per-frame logs (overflows buffers).
- Whisper timestamps are ±1–2 s: decide cuts from audio silences, not from Whisper.
- This ffmpeg build has no `drawtext`; label images in chat, or with Remotion.
- Zoom recordings often show a BLACK screen while the presenter talks before (re)sharing the screen ("các bạn thấy màn hình chưa?"). Before finalizing `edl.json`, run `blackdetect` on the first ~60 s of each lesson; if the start is black, move the lesson start to the first cue after the screen appears.
- Black screen can be much longer than a few seconds (presenter talks for minutes before sharing the screen) and full-frame `blackdetect` MISSES it when wallpaper bars surround the video. Check brightness of the CENTER region (`crop=iw*0.6:ih*0.6,signalstats` YAVG < 8 for ≥4 s) on the source for each lesson start, and move the start to the first cue after the screen appears.
- To change only intros/order, use `v2e render --only X --force --reassemble` (reuses `out/edited/`, <1 s per lesson) instead of re-rendering bodies.
- Self-check of the sample MUST include looking at the opening frames: they must equal the approved thumbnail.
- QA "freeze ≥60 s" warnings on slides/static screens with speech are normal — only investigate black frames, loudness, A/V sync, duration mismatches.
- In zsh, `$var:foo` triggers modifiers — use `${var}` inside filter strings. A glob with no match (`rm out/*.part.mp4`) aborts the WHOLE command — use `find … -delete`.

## Hard rules (repeat — do not violate)

- NEVER modify/delete anything in `input/` or the original video.
- NEVER cut before G1. NEVER batch thumbnails before G2/G3. NEVER batch render before G4 (or explicit unattended approval + self-check).
- Cuts/speed-ups are based on silences measured from audio, NOT on Whisper timestamps.
- Vietnamese text on thumbnails/intros is ALWAYS rendered by Remotion; AI images must never contain title text.
- Always cut segments that show credentials, passwords, API keys.
- `v2e status <dir>` tells where a project is; use it when resuming in a new session.
