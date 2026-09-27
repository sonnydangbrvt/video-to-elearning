# PLAN cắt: {TÊN BUỔI} — {Tên khoá}

> Video: `{input/source.mp4}` ({W×H}, {fps}fps, {HH:MM:SS}) · người nói: {host} {+ khách mời}
> Transcript: {Zoom VTT | Whisper + VAD} · {N} câu · {k} câu ảo giác đã loại
> Nội dung hữu ích: **{00:02:25} → {04:09:42}** · ✂️ bỏ đầu buổi + tổng kết cuối {+ đoạn bán hàng}
> ✅ Mốc đã căn theo đầu/cuối câu. **ĐÂY LÀ PLAN — CHƯA CẮT. Cần duyệt.**

## 1. Tổng quan

- **Chủ đề:** …
- **Đối tượng:** …
- **Học xong được gì:** 3–5 gạch đầu dòng, bắt đầu bằng động từ.
- **Đề xuất:** **{M} bài · {N} phần** — A. … (A1–A{x}) · B. … · Bonus (nếu có).
- **Ước tính:** {gốc HH:MM:SS} → {sau cắt HH:MM:SS} (bớt ~{%}) — số liệu từ `v2e edl`.

## 2. Bảng cấu trúc cắt chi tiết

### PHẦN A — {Tên phần}
> Phần này nói gì: 1 câu.

| Mã | Timestamp | Cue | Th.lượng | Tên bài & nội dung |
|----|-----------|-----|----------|--------------------|
| A1 | `00:02:25–00:06:08` | #13→#31 | 3:43 | **{Tên bài: động từ + kết quả}** — ý 1; ý 2; ý 3 |
| A2 | … | … | … | … ⚠️(có đoạn lỗi — Mục 4) |

### PHẦN BONUS (đặt cuối)
| D1 | … | … | … | **(Bonus) …** — lý do tách riêng |

## 3. Đoạn CẮT BỎ

| Khoảng | Cue | Loại | Xử lý |
|---|---|---|---|
| `00:00:00–00:02:25` | #1–#12 | Chào hỏi, dò âm thanh | Cắt |
| `01:04:00–01:23:45` | — | Whisper ảo giác = im lặng/học viên thực hành | Cắt (giữ 2s) |
| `…` | … | Bán hàng / khảo sát / chứng nhận | Cắt hoặc → Bonus |

## 4. Đoạn cần DUYỆT RIÊNG (giảng sai / xin lỗi / làm lại)

> Mỗi đoạn được xuất thành clip ±2s trong `out/review-mistakes/` để xem trước khi chốt.

| # | Timestamp | Cue | Trích | Mô tả | Đề xuất |
|---|-----------|-----|-------|-------|---------|
| M1 | `00:31:47` | #163 | "…sorry…" | Bối rối vì giao diện đổi | Cắt |
| M2 | `03:58–04:04` | #1405–1440 | "nó đang bị lỗi…" | Lỗi demo → dạy debug | **Giữ** |

**Đề xuất mặc định:** cắt M…, rút gọn M…, giữ M… .

## 5. Âm thanh

- Độ to gốc: {x} LUFS · nền ồn {y} · đặc điểm: {ù quạt / vang phòng / mic khách mời nhỏ}
- Preset đề xuất: **{standard}** (nghe mẫu: `v2e clean-audio <dir> --sample`)
- Tiếng ồn cần tắt tiếng (mute): {`01:12:03–01:12:06` chuông điện thoại}

## 6. Gợi ý biên tập & thumbnail

- Bài dài nên tách: {C4 (22') tách tại 04:02}.
- Thuật ngữ cần chuẩn hoá trên phụ đề: …
- Điểm "đinh" làm thumbnail nổi bật: …
- Thumbnail: phương án {A nền mặc định | B nền AI riêng — xem out/thumb-prompts.md}.

## Phụ lục — Thuật ngữ Whisper nghe nhầm
- "…" = **…**
