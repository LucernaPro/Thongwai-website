#!/bin/sh
# รันชุดทดสอบทั้งหมด — ต้องผ่านครบก่อน push ทุกครั้งที่แก้ worker.js
cd "$(dirname "$0")/../.." || exit 1
total=0; bad=0
for f in tools/test/scen*.mjs; do
  out=$(node "$f" 2>/dev/null | tail -1)
  printf '%-22s %s\n' "$(basename "$f")" "$out"
  n=$(echo "$out" | sed 's/[^0-9]*\([0-9]*\) *\/ *\([0-9]*\).*/\1 \2/')
  set -- $n; [ "$1" = "$2" ] || bad=1
  total=$((total + $2))
done
echo "-----------------------------------"
[ $bad -eq 0 ] && echo "ผ่านครบ $total เคส" || { echo "มีเคสไม่ผ่าน"; exit 1; }
