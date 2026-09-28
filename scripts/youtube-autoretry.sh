#!/bin/zsh
# Tự thử lại mỗi giờ: upload phần còn lại → đặt bù thumbnail → xuất links + course.json. Dừng khi xong hoặc sau 36 giờ.
cd "$(dirname "$0")/../.."
V="$HOME/.claude/skills/video-to-elearning/bin/v2e.mjs"
for i in $(seq 1 36); do
  echo "=== $(date '+%F %T') lượt $i ==="
  node "$V" youtube . upload --yes 2>&1 | grep -v "^↷"
  node "$V" youtube . thumbs 2>&1 | tail -3
  node "$V" youtube . links > /dev/null 2>&1
  node "$V" deliver . 2>&1 | tail -2
  done=$(python3 -c "import json;s=json.load(open('out/youtube/state.json'))['videos'];print(len(s)>=26 and all(v.get('thumb') for v in s.values()))")
  if [ "$done" = "True" ]; then echo "=== HOÀN TẤT $(date '+%F %T') ==="; osascript -e 'display notification "Đã đăng đủ 26 bài + thumbnail" with title "Vibe Code 3D → YouTube"' 2>/dev/null; exit 0; fi
  sleep 3600
done
echo "=== Hết 36 giờ, vẫn chưa xong — xem log ==="
