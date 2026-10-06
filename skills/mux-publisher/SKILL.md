---
name: mux-publisher
description: Đẩy một bộ video (khoá học, workshop, bài giảng — bất kỳ thư mục .mp4 nào hoặc dự án video-to-elearning) lên Mux, lưu Asset ID / Playback ID / phiên upload vào sổ đăng ký dùng chung để tra lại, bật link MP4, và xuất THƯ MỤC BÀN GIAO CHUẨN cho từng bài (mã nhúng iframe, link player/MP4/HLS, mô tả, mục tiêu, checklist, thuật ngữ, thumbnail, phụ đề, course.json, lessons.csv). Dùng khi người dùng nói "đẩy video lên Mux", "upload Mux", "lấy embed code Mux", "link mp4", "xuất thư mục bàn giao", "tìm lại video trên Mux", "asset id / playback id", "gom nhóm video Mux", "phiên upload".
---

# mux-publisher

CLI (zero dependencies, Node ≥ 18): `node ~/.claude/skills/mux-publisher/scripts/mux-pub.mjs <command>` (written `mux-pub` below).
Talk to the user in Vietnamese. The rules below are in English on purpose — follow them exactly.

## ⛔ NON-NEGOTIABLE RULES — read before any command

1. **Confirmation gate before EVERY upload batch** (even 1 test video). Run `mux-pub plan <folder>` (or `upload` without `--yes`), paste the printed table to the user, and wait for an explicit yes on: **playback policy (`signed` | `public`, NO default)** · owner/tenant · group (course slug) · course name · MP4 on/off (extra storage cost) · the exact video list. Only then run `upload … --yes`. A previous approval never carries over to a new batch.
2. **Never handle the user's secrets in web forms.** The user creates the Mux access token (Dashboard → Settings → Access Tokens, Mux Video Read + Write) and saves `{"tokenId","tokenSecret"}` to `~/.config/video-to-elearning/mux.json` (chmod 600) — or env `MUX_TOKEN_ID/MUX_TOKEN_SECRET`. Never print the secret.
3. **Never do billing.** Free plan = max 10 assets → tell the user to upgrade in Dashboard → Billing, then resume (uploads are resumable; done videos are skipped).
4. **Always test 1 video first** (`upload --test --yes`), let the user check the player link, then confirm the rest.
5. **Never delete Mux assets** unless the user explicitly asks for that specific asset.

## Workflow

| Step | Command | Notes |
|---|---|---|
| 0. Check | `mux-pub doctor` | Node, token, API reachable, registry size |
| 1. Manifest | `mux-pub init <folder> --course "…" --group <slug> --owner <id>` | Scans *.mp4 (natural sort) → `<folder>/mux-publish/manifest.json`. For a **video-to-elearning project** add `--from-v2e`: imports titles, parts, summary/objectives/checklist/keyTerms (work/lesson-content), thumbnails (out/thumb), captions (out/captions), policy/group/owner from `edl.json › mux` |
| 2. Content | edit manifest | If `summary/objectives/checklist` are empty, write them (from transcript/captions if available; only facts from the source). Optional but recommended — the export is for an LMS agent |
| 3. Confirm | `mux-pub plan <folder>` | ⛔ Gate — show table, wait for yes |
| 4. Test | `mux-pub upload <folder> --test --yes` | 1 video → send `playerUrl` to the user |
| 5. Batch | `mux-pub upload <folder> --yes` | New **session** id `<group>-YYYYMMDD-HHMM`; every asset recorded in the registry |
| 6. MP4 | `mux-pub mp4 <folder> --yes` | Adds static rendition `highest` where missing and waits until ready → `https://stream.mux.com/<pb>/highest.mp4` (signed → needs token) |
| 7. Export | `mux-pub export <folder>` | Standard delivery folder (below) |
| Existing assets | `mux-pub adopt <folder>` | Registers videos already on Mux (from `out/mux/state.json` of a video-to-elearning project, or by `meta.external_id = <group>:<code>`) |
| Find later | `mux-pub find <keyword>` · `mux-pub sessions [--group g]` | Search by title, code, group, owner, asset/playback id, session |

## Where IDs live (so anything can be found again)

- **Global registry:** `~/.config/video-to-elearning/mux-registry.json` — every asset (assetId, playbackId, policy, uploadId, group, owner, course, code, order, title, part, duration, local file, file fingerprint, sessionId, uploadedAt, mp4 status, project path) + every session (id, time, course, policy, project, assetIds). Shared by all projects.
- **On Mux itself:** `meta.title`, `meta.external_id = <group>:<code>`, `meta.creator_id = <owner>`, `passthrough = {g, cat, code, i}` — searchable in the dashboard and used by `adopt`.
- **Duplicate protection:** a file is skipped if the registry already has the same group+code or the same fingerprint (size + sha1 of first/last 4 MB), even after renaming.

## Standard delivery folder (`mux-publish/export/<group>/`)

```
README.md              overview + table (order · code · title · duration · player · MP4)
course.json            schema mux-publisher.export/1 — course + lessons (all fields below) + missing{mux,mp4,content}
lessons.csv            one row per lesson (URLs, embed, IDs, session, summary, objectives, checklist…)
embeds.html            open in a browser: every player + copy-ready embed code
registry-snapshot.json sessions + assets of this group (IDs to find things again)
lessons/NN-CODE-slug/
  lesson.md            title, part, duration, links, IDs, description, objectives, checklist, terms, practice, embed code
  lesson.json          same as course.json entry
  embed.html           only the iframe
  thumbnail.png        (if available)
  captions.<lang>.srt  (if available)
```
Each lesson's `mux` block: `assetId, playbackId, policy, sessionId, uploadedAt, playerUrl, hlsUrl, mp4Url, mp4DownloadUrl, thumbnailUrl, embedHtml, requiresToken`.
Embed = `<iframe src="https://player.mux.com/<pb>?metadata-video-title=…&metadata-video-id=<code>&metadata-video-series=<group>" style="width:100%;border:none;aspect-ratio:16/9;" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>` (same as the Dashboard "Embed" button; the metadata feeds Mux Data per lesson/course). Signed → the site appends `&token=<JWT>` (Mux Signing Key, minted by the backend).

## Report to the user at the end

Table (order · title · duration · player link) + path of the export folder + anything in `missing`. Offer `find`/`sessions` for later lookups.

## Hard rules (repeat)

- NO upload without the confirmation table + explicit yes for THIS batch. Policy has NO default.
- Test 1 video first. Never billing, never secrets in chat/web fields, never delete assets unasked.
- Network in VN can be slow on first DNS/IPv6 — the script forces IPv4 and retries; if it still fails, retry later, don't loop.
