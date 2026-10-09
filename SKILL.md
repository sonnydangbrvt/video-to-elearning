---
name: video-to-elearning
description: Biến video dài 1–4 giờ (Zoom/workshop/livestream/screencast) thành bộ bài giảng e-learning — transcript, lập PLAN chia phần/bài để duyệt, cắt đoạn thừa (chuyển cảnh mượt + SFX), tua 2x khoảng lặng, bỏ đoạn nói nhầm, khử ồn + chuẩn âm lượng, intro Remotion, thumbnail theo brand (HTML/Remotion template, ảnh chụp thật hoặc nền AI), QA và xuất curriculum + phụ đề. Dùng khi người dùng gửi video/folder video dài và muốn "cắt thành bài giảng", "làm khoá học", "chia chương", "e-learning", "cắt video buổi học/bootcamp/workshop", "làm thumbnail bài học", "bỏ đoạn thừa/tiếng ồn", kể cả khi không nhắc tên skill.
---

# video-to-elearning

CLI: `node ~/.claude/skills/video-to-elearning/bin/v2e.mjs <command>` (written `v2e` below).
User-facing guide: [HUONG-DAN.md](HUONG-DAN.md). Full process + rationale: [docs/QUY-TRINH.md](docs/QUY-TRINH.md). Thumbnails: [docs/THUMBNAIL.md](docs/THUMBNAIL.md).
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
- **Campaign headline + mascot (optional, used for the Muse AI set):** `edl.brand.thumbHeadline` (e.g. `"LÀM CHỦ MÔ HÌNH\n**MUSE AI** MỚI"`, `\n` = line break, `**…**` = accent colour) is drawn big at the top-left of EVERY thumbnail; `edl.brand.thumbMascot` = a transparent PNG in `<project>/brand/` placed bottom-right over the device frame. Ask the user for the headline text and mascot image when they want a product/campaign look. Put the whole set in ONE approval message (overview sheet + 2 full-size) together with the sample video (Step 7) when the user asks to approve "once".
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
**Topic callouts (text on the left, on by default when `lessons[].callouts` exist):** each `{cue, at, title, sub, icon}` becomes a transparent PNG card (Remotion `Callout`, cached in `out/callouts/`) overlaid bottom-left for 4.6 s with fade + slide-in at the START of that cue (source time → output time via the segment map; callouts inside cut regions are skipped; never overlapping). Write 4–8 punchy callouts per lesson (title ≤ 5 words + one-line sub + emoji) from the PLAN topic map; use cue numbers, never hand-typed times. `edl.callouts=false` disables.
**NO music under the speaker (hard rule, user decision):** while the presenter talks there is only noise reduction / filtering / loudness normalisation — never background music. Music is allowed ONLY in the 4-second thumbnail intro. The optional `edl.bed` mixer exists but is OFF by default and must stay off unless the user explicitly asks for a bed on a specific lesson (e.g. a silent screen-recording insert).
**Full-frame stills over narration** (`lessons[].stills = [{at: <src sec>, file, dur?}]`, files in `<project>/stills/`): when the recording lacks a screen (e.g. only the AI app was recorded, not the browser), the user sends screenshots; they are overlaid full-frame (blurred backdrop, 0.4 s fades) while the original narration keeps playing. **Masks** (`lessons[].masks = [{x,y,w,h,from?,to?}]`, 1920×1080 coordinates, times in the CUT video excluding the intro) blur keys/emails; locate the region by cropping frames every 15 s first, and blur keys inside stills with ffmpeg before use. `boxblur` radius must be < half the chroma height (use ≤10 for 68 px tall regions). Mux assets cannot be replaced: re-upload creates new playback IDs (delete the changed entries in `out/mux/state.json` first; old assets stay on Mux).

**Insert an external video in place of a source range** (`lessons[].inserts`, e.g. when part of the live was broken and the user records a clean tutorial): `{ "from": <src sec>, "to": <src sec>, "file": "<abs path>", "audioUntil": <sec>, "label": "…" }`. The range [from,to] is removed (snapped to pauses like any cut) and the clip plays there with the same transitions/whoosh before and after. Different aspect ratio → shown fitted over a blurred copy of itself (no black bars). Audio: the part with speech `[0, audioUntil]` is noise-reduced and normalised to −16 LUFS; the rest of the clip keeps its OWN background music (no speech) at `musicLufs` (default −24, i.e. gentle) with a 0.4 s crossfade — never mute it. ⚠️ A steady low-level sound in a screen-recording clip is usually the user's background music, NOT noise: whisper "hallucinating" text like "subscribe" over it is the tell. Listen/measure (ebur128 per 10 s) before deciding anything; do not trim or mute the user's own clip audio unless they ask (a stray remark is theirs to remove). Callouts for it use `{ "insert": 0, "offset": <sec in clip>, "title", "sub", "icon" }` (step-by-step labels: look at a frame every 5 s of the clip to place them). The cut log lists it as "Thay bằng video chèn". Always check frames at the join and the loudness (speech ≈ −16 LUFS, music part ≈ −24 LUFS) before the batch. QA allows ≥ −20 LUFS integrated for lessons with such an insert.
**Merge rule:** two cuts closer than `rules.mergeGap` (6 s) are merged into one so there are never two transitions within a few seconds.
Cut transitions: at every dropped segment the outgoing scene's audio fades down, video crossfades (`edl.transition`), and a whoosh SFX plays (`edl.sfx.cut`) so viewers feel the previous scene ended. Every cut is logged to `out/cut-log.md` / `.csv` with the lesson number, timestamp-in-video, removed source range, and reason — so the user can point to "video 12, cut at 07:23".

## 9. QA + delivery — GATE G5

`v2e qa <dir>` → fix ❌ lessons. `v2e export <dir>` → `out/curriculum.json/.csv`, `out/captions/*.srt`. Report: lesson count, original → final duration, total size, issues to review, output folders.

## 10. Post-production: publish to a video host (only when the user asks)

Hosts are pluggable: each host writes `out/<host>/state.json` = `{ videos: { <CODE>: { id, url, title, privacy, index } }, playlistId? }` and `lib/deliver.mjs › HOSTS` maps it to `{ provider, id, url, embedUrl, thumbnailUrl, privacy }`. Today: **YouTube**. To add Bunny Stream / Vimeo / S3 later: write an uploader that produces the same state.json + add one entry in `HOSTS`. Never change the delivery schema for a new host.

### ⛔ Batch confirmation gate (ALL hosts — never skip)

Before EVERY upload batch (any host, even a single test video) show the user and get an explicit yes on:
**playback/privacy policy** (Mux: `signed` | `public`; YouTube: `public` | `unlisted` | `private`) — there is NO default, the tool refuses without an explicit choice · **owner/tenant** · **group (course)** · **course name** · **the exact list of videos**. Run the command WITHOUT `--yes` first: it prints this confirmation table; paste it to the user; only after they approve run again with `--yes`. A previous approval does not carry over to a new batch.

### 10a. YouTube

`v2e youtube <dir> auth | plan | upload | links` — YouTube Data API v3 with the USER's own OAuth client (no extra npm deps).
1. One-time setup is done BY THE USER (never create accounts or enter credentials for them): Google Cloud project → enable "YouTube Data API v3" → OAuth consent screen (External, add their Gmail as test user) → OAuth client ID type **Desktop app** → save JSON as `~/.config/video-to-elearning/youtube-client.json`. Then `v2e youtube <dir> auth` opens the browser; the user signs in and clicks Allow. Token is stored locally (chmod 600).
2. `v2e youtube <dir> plan --privacy unlisted|public|private` → `out/youtube/plan.md` (titles ≤100 chars, description with bullets, tags, playlist, quota estimate). **Show it and WAIT for explicit confirmation** — uploading publishes to the user's channel.
3. `v2e youtube <dir> upload --test --yes` uploads ONE lesson first and verifies YouTube kept the requested privacy. ⚠️ Projects that have NOT passed the YouTube API audit get every upload **locked private forever** (cannot be changed in Studio, no appeal — must re-upload). The tool stops if that happens; point the user to https://support.google.com/youtube/contact/yt_api_form . Alternative without audit: upload via YouTube Studio or a verified service (e.g. Upload-Post, if connected).
4. After the test is confirmed: `v2e youtube <dir> upload --yes` (resumable; done lessons skipped) + thumbnails (needs phone-verified channel) + playlist in lesson order. Captions are NOT uploaded by default (captions.insert costs 400 units each).
5. Report `out/youtube/links.md` / `links.csv` (index, title, URL, privacy, playlist link).
6. Setup can be done WITH the user in the browser pane if they are signed in to Google Cloud and ask you to: create a SEPARATE project (never reuse a production project), enable the API, Google Auth Platform (External, their Gmail as test user), OAuth client "Desktop app". Ask before ticking the "I agree to Google API Services User Data Policy" box. The browser pane cannot save downloads to disk: read client_id/secret from the dialog text and write `youtube-client.json` (chmod 600) yourself. The user must click Allow on the consent screen themselves.
7. Channel limits seen in practice (not API quota): **~20 uploads per channel per 24 h** (`uploadLimitExceeded`) and a **thumbnail rate limit (~10 in a burst, HTTP 429)**. For >20 lessons plan two days. When the user wants it finished unattended, copy `scripts/youtube-autoretry.sh` into `<dir>/out/youtube/`, start it detached (`nohup … & disown`) and keep the Mac awake with `caffeinate -i -w <pid>`: it retries once per hour (upload → thumbs → links → deliver), stops when all lessons have video + thumbnail or after 36 h, and logs to `out/youtube/autoretry.log`. Never tight-loop on these errors.
8. Verified in practice (2026-09): a brand-new, un-audited project uploaded as **unlisted** successfully and stayed unlisted after processing — but ALWAYS keep the `--test` step and re-check `status.privacyStatus` after processing finishes before uploading the rest.

### 10b. Mux (recommended host for paid courses / white-label)

> For a full Mux delivery (registry of IDs/sessions, MP4 links, standard per-lesson export folder) use the companion skill **mux-publisher** (`skills/mux-publisher`, `mux-pub init <project> --from-v2e` → `plan` → `upload` → `mp4` → `export`). The `v2e mux` commands below remain for quick uploads.


- **Batch upload from disk = `v2e mux`** (Direct Upload API). The official Mux MCP server (`https://mcp.mux.com`, OAuth) has NO filesystem access — use it for management in chat (list/inspect assets, playback policies, analytics, signing keys), not for uploading local files.
- Setup (user does it; never type their secrets into web fields): Mux Dashboard → Settings → Access Tokens → new token, environment = the one for courses, **Mux Video Read + Write** → save `{"tokenId","tokenSecret"}` to `~/.config/video-to-elearning/mux.json` (chmod 600) or env `MUX_TOKEN_ID/MUX_TOKEN_SECRET` → `v2e mux <dir> check`.
- Playback policy has NO default: ask **signed** (paid courses — the LMS backend mints JWTs with a Mux Signing Key) or **public**, and record it in `edl.mux.policy` only after the user chooses.
- Grouping (Mux has no folders): `meta.creator_id` = owner/tenant (e.g. `coachio`, partner id) · `meta.external_id` = `<group>:<CODE>` (group = course slug, `edl.mux.group`) · `passthrough` = `{g, cat, code, i}` where `cat` = part label. `v2e mux <dir> catalog` lists ALL assets in the environment grouped owner → group → category → `out/mux/catalog.md`.
- `v2e mux <dir> upload --test --yes` (1 lesson) → user checks the dashboard → `v2e mux <dir> upload --yes`. Each asset gets `meta.title`, `meta.external_id = v2e:<CODE>`, optional `meta.creator_id` (tenant), and `passthrough` JSON {course, code, index} — use these for multi-tenant lookups.
- Output `out/mux/state.json` + `links.md/csv` + **embed codes** (`embed-codes.md/csv` and `embed-preview.html` — iframe `player.mux.com/<playbackId>` with `metadata-video-title/id/series`, same as the Dashboard "Embed" button; also `lessons[].video.embedHtml` in course.json). Signed policy → the website appends `&token=<JWT>`; `v2e deliver <dir> --host mux` makes Mux the primary video in `course.json` (both hosts are always listed under `lessons[].hosts`).
- Mux **Free plan = max 10 assets** (upload fails with "Free plan is limited to 10 assets"). Check the plan BEFORE a batch >10 and tell the user to upgrade in Dashboard → Billing (never do billing yourself). `deliver` falls back to another host (e.g. YouTube) for lessons missing on the primary host.
- Mux has no custom-thumbnail upload: the LMS should use our approved PNG (`files.thumbnail`); `thumbnailUrl` is Mux's auto frame.

## 11. Delivery package for the e-learning website — ALWAYS the last step after publishing

The final result of post-production is ONE machine-readable file an agent can push to the LMS: `out/delivery/course.json` (schema `v2e.delivery/1`), plus `course.md` (human) and `lessons.csv` (spreadsheet import).
1. `v2e deliver <dir> --prepare` → `work/lesson-text/<CODE>.txt` (transcript of the KEPT parts only).
2. For every lesson write `work/lesson-content/<CODE>.json`: `summary` (2–4 sentences), `objectives` (3, verb-first), `checklist` (4–7 concrete items in video order), `keyTerms`, `tools`, `level`, `practice`. Only facts from the transcript; fix misheard terms; no sales talk. For >10 lessons split across parallel sub-agents (≈9 lessons each).
3. `v2e deliver <dir>` → merges edl + real durations (ffprobe) + host state (URL, embed URL, thumbnail URL, privacy, playlist) + lesson content + local file paths. It lists anything missing (`missing.video`, `missing.content`) — fix before reporting.
4. Report to the user: the table (order · title · duration · link) + paths of `course.json` / `course.md` / `lessons.csv`.

Quota (2026): videos.insert has its own bucket of 100 uploads/day; thumbnails.set 50, playlistItems.insert 50, playlists.insert 50 from the 10,000 units/day pool.

## 12. Revisions after delivery (the user will say "video 12, cut at 07:23 …")

The user points at things using `out/cut-log.md` (video number · time in video · removed source range · reason) and `out/review-mistakes/`. Translate and re-render ONLY the affected lessons:
- **Keep a dropped segment / move a cut:** set that `mistakes[].drop = false` (or edit `drops`) → `v2e edl <dir> --snap` → `v2e render <dir> --only CODE --force`.
- **Time given "in the video" → source time:** look it up in `out/segmaps/CODE.json` (`contentOffset` + each segment's `out`, `s`, `e`, `sp`); never guess.
- **Title / thumbnail frame:** edit `title`, `thumbTitle`, `thumbFrameAt` → `v2e thumbs <dir> --only CODE --force` → `v2e render <dir> --only CODE --force --reassemble` (body is reused).
- **Start/end of a lesson:** edit `start`/`end` (re-check the black-screen rule) → `edl --snap` → `render --only CODE --force`.
- **Intro music / background / transitions:** `edl.introMusic`, `edl.frame.background`, `edl.transition` → `render --all --force` (add `--reassemble` when only intro music/thumbnail changed).
- After ANY revision: re-run `v2e qa`, `v2e export` (captions + cut log are regenerated), then report which videos changed. Lessons already uploaded to a host must be re-uploaded — tell the user and ask before doing it (batch gate applies).
- Never touch lessons the user did not mention.

## Lessons learned (from real production — follow them)

**Speed first.** The user values fast production. Skip anything slow that is not clearly needed. Preview layout/look decisions with STILL IMAGES (a single frame composited with `ffmpeg -frames:v 1`, or `v2e thumbs`) before rendering any video.

**Layout = "A + C" (default, approved):**
- Auto-detect and crop the recording's own black borders per lesson (`detectCrop`, union of 10 samples → never cuts content).
- Content ≈16:9 → fills the 1920×1080 frame (no border, sharpest text).
- Content 4:3 → contained on a macOS wallpaper (`edl.frame.background`) instead of black bars.
- ❌ Do NOT build window-chrome mockups (Safari frame) or floating-window-with-shadow layouts unless the user asks: slower, smaller text, and rejected by the user.

**Cuts must feel intentional, never abrupt.** Every dropped segment = a transition: outgoing audio fades down (~0.8 s), video crossfades (`edl.transition`), a whoosh SFX plays. Cut starts snap slightly EARLIER into a pause, ends slightly LATER. Every transition is logged in `out/cut-log.md/.csv` (video number, time in video, removed source range, reason) so the user can say "video 12, cut at 07:23".

**Intro = the APPROVED THUMBNAIL of that lesson** (`out/thumb/NN-CODE.png`), shown 4 s with fade in/out + shared intro music (`assets/music/intro-music.m4a`, −18 LUFS, fades) + intro whoosh, then concatenated to the lesson WITHOUT re-encoding (`-c copy`). Never use a separate/old intro template: the user approved the thumbnails, the video must open with exactly those (a stale Antigravity intro template once slipped through — never again). Render thumbnails BEFORE the batch. Same music for every video unless the user provides another (`edl.introMusic`).

**Order the user wants:** PLAN → thumbnails (approve) → 1 sample video (approve) → batch render unattended (they often go to sleep — run to completion, then QA + export). When they say "tell me once what needs my approval", send thumbnails + sample in ONE message and then wait; after their yes, run everything (batch, QA, export) without further questions.

**Lesson order may differ from the recording order** (edl.lessons order = course order; only overlap is checked), e.g. put "Sign up" right after "What is X".

**Second recording of the same topic (workshop "lần 2"/supplement) — rules from real use:**
- Diff against the earlier PLAN: keep ONLY content that is NEW or UPDATED; cut anything identical to the earlier set (map each cut range to the earlier lesson code in the PLAN, section "Đoạn TRÙNG"). Never re-publish the same lesson twice.
- Keep ONLY content that belongs to the course topic (e.g. 3D game). Off-topic demos, tool ads, sales, Muse/other products → cut, do NOT make Bonus lessons unless the user asks.
- Naming: merge new lessons into the EARLIER part structure with a ".1" suffix — `parts: {"A.1": "PHẦN A.1 · …"}`, lesson codes `A.1.1`, `C.1.2` … (thumbnail pill shows "PHẦN A.1 · Tư duy 3D", chip "Bài A.1.1"). Keep part labels SHORT so the pill stays on one line (≤ ~25 chars after the part code).
- A sub-project that continues into an "advanced" course (e.g. the vocabulary game that later gets a database) = its own part `V` with `thumbKicker` "NÂNG CAO · DATABASE"; render it in the same project but report it as a separate series and copy it to `out/<series>/`.
- Loudness must match the earlier set: same preset (`standard`), −16 LUFS target; compare `ebur128` of a new lesson vs 2–3 old finals (±0.5 LU is fine). Different recording days → only normalise/optimise, never EQ-match, never add music under speech.
- Transcript sources: Zoom VTT, **YouTube `.sbv`** (auto captions; supported, strip `[hắng giọng]`), or local Whisper (+VAD). A YouTube-downloaded video is 720p: fine for planning/rendering, but ask the user for the original Zoom MP4 for the final if available.
- Verify the file is the RIGHT recording before analysing: grep the transcript for the topic's key terms (Tripo, GLB, rig…) and read the first cue; the user once sent the wrong session (a different bootcamp day) and the mismatch was caught by keyword counts.

**Technical pitfalls (already fixed — do not reintroduce):**
- Never feed an infinite input (`-loop 1` image) to a filter graph unless the overlay uses `shortest=1` with the video as the finite stream; otherwise ffmpeg never stops.
- Measure loudness with `ebur128=peak=true:framelog=quiet` (fast). Never measure long audio with `loudnorm` (it resamples to 192 kHz — minutes per hour of audio) and never let ebur128 print per-frame logs (overflows buffers).
- Whisper timestamps are ±1–2 s: decide cuts from audio silences, not from Whisper.
- This ffmpeg build has no `drawtext`; label images in chat, or with Remotion.
- Zoom recordings often show a BLACK screen while the presenter talks before (re)sharing the screen ("các bạn thấy màn hình chưa?"). Before finalizing `edl.json`, run `blackdetect` on the first ~60 s of each lesson; if the start is black, move the lesson start to the first cue after the screen appears.
- Black screen can be much longer than a few seconds (presenter talks for minutes before sharing the screen) and full-frame `blackdetect` MISSES it when wallpaper bars surround the video. Check brightness of the CENTER region (`crop=iw*0.6:ih*0.6,signalstats` YAVG < 8 for ≥4 s) on the source for each lesson start, and move the start to the first cue after the screen appears.
- Thumbnail screenshots are cached per lesson CODE. If a code is reused for different content (renumbering), the old screenshot would be reused → wrong thumbnail. The cache now stores the frame time (`thumb-shots/<code>.jpg.at`) and re-extracts when it changes; when you rename/renumber lessons, still run `v2e thumbs <dir> --force` once and LOOK at the overview sheet.
- When restructuring an EDL after a first render, move old `out/*` aside (e.g. `out/_v1/`) — `render --all` also needs `out/final/` (now auto-created). Never reuse old `out/edited/<code>.mp4` for a code whose content changed.
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
