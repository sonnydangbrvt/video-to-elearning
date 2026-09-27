#!/bin/zsh
# Cài video-to-elearning làm Claude Code skill + kiểm tra môi trường.
# Chỉ cài/tải các thành phần còn thiếu SAU KHI người dùng xác nhận.
DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS="$HOME/.claude/skills"
mkdir -p "$SKILLS"
if [[ -e "$SKILLS/video-to-elearning" && ! -L "$SKILLS/video-to-elearning" ]]; then
  echo "✗ $SKILLS/video-to-elearning đã tồn tại (không phải symlink). Đổi tên/xoá thư mục đó rồi chạy lại."
  exit 1
fi
ln -sfn "$DIR" "$SKILLS/video-to-elearning"
echo "✔ Skill đã liên kết: $SKILLS/video-to-elearning → $DIR"

# doctor tự hỏi [y/N] trước khi cài/tải
node "$DIR/bin/v2e.mjs" doctor --install
