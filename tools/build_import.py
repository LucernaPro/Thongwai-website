# -*- coding: utf-8 -*-
"""แปลงสมุดจอง Excel → tools/import-data.json สำหรับ action=import (เครื่องมือถาวร)
ใช้: python3 tools/build_import.py <ไฟล์.xlsx> [prefix]
- prefix = ตัวนำหน้ารหัสแถว (default X) — **รอบนำเข้าใหม่ให้ใช้ prefix ใหม่** เช่น Y, Z
  กันชนกับรหัสรอบก่อน (INSERT OR IGNORE เทียบด้วย id)
- กติกาแปลง (ตรงกับรอบแรก 19 ส.ค. 2026):
  พ.ศ.>2500 → -543 / checkout ไม่ valid (≤checkin หรือ >30 วัน) → checkin+จำนวนคืน
  เบอร์ขยะ (<5 หลัก หรือเลขซ้ำล้วน) → ว่าง / เรือนร่ำรวย → R6 (ป้ายจริง: ล้ำลวย)
  เต้นท์หลังเล็ก1-8 → T1-T8 / ห้องอื่นที่ไม่รู้จัก → "X:ชื่อเดิม" (ประวัติ ไม่บล็อกปฏิทิน)
หลังรัน: ตรวจ output → commit + push → เปิด /admin/import/ กดนำเข้า"""
import pandas as pd, re, json, sys
from datetime import date, timedelta

SRC = sys.argv[1] if len(sys.argv) > 1 else None
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'X'
if not SRC:
    sys.exit('ใช้: python3 tools/build_import.py <ไฟล์.xlsx> [prefix]')

ROOM_MAP = {
 'เรือนมหาเศรษฐี':'R1','เรือนโชคลาภเงินทอง':'R2','เรือนเจ้าสัว1':'R3','เรือนเจ้าสัว2':'R4',
 'เรือนมั่งมีเงินทอง':'R5','เรือนร่ำรวย':'R6','เรือนอุดมสุข':'R7','เรือนมั่งคั่ง':'R8','เรือนมหาเฮง':'R9',
 'เต้นท์หลังเล็ก1':'T1','เต้นท์หลังเล็ก2':'T2','เต้นท์หลังเล็ก3':'T3','เต้นท์หลังเล็ก4':'T4',
 'เต้นท์หลังเล็ก5':'T5','เต้นท์หลังเล็ก6':'T6','เต้นท์หลังเล็ก7':'T7','เต้นท์หลังเล็ก8':'T8',
}

def parse_d(s):
    if not isinstance(s, str): return None
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if not m: return None
    y, mo, dd = int(m[1]), int(m[2]), int(m[3])
    if y > 2500: y -= 543
    try: return date(y, mo, dd)
    except ValueError: return None

def clean_phone(s):
    d = re.sub(r'\D', '', str(s or ''))
    return '' if len(d) < 5 or len(set(d)) <= 1 else str(s).strip()

def money(s):
    try: v = float(s); return v if v > 0.5 else 0
    except: return 0

df = pd.read_excel(SRC, dtype=str)
out = []
for i, r in df.iterrows():
    ci = parse_d(r['checkin'])
    if ci is None: continue
    try: nights = max(1, int(float(r['จำนวนคืนที่เข้าพัก'])))
    except: nights = 1
    co = parse_d(r['checkout'])
    if co is None or co <= ci or (co - ci).days > 30:
        co = ci + timedelta(days=nights)
    orig = str(r['room']).strip()
    room = ROOM_MAP.get(orig, 'X:' + orig)
    name = str(r['ชื่อลูกค้า']).strip() if isinstance(r['ชื่อลูกค้า'], str) else '-'
    note = []
    b = money(r['มัดจำ']); k = money(r['มัดจำ(กีบ)'])
    if b: note.append(f'มัดจำ {b:,.0f}฿')
    if k: note.append(f'มัดจำ {k:,.0f} กีบ')
    note.append('รวมอาหารเช้า' if str(r['อาหารเช้า']).strip() == 'มี' else 'ไม่รวมอาหารเช้า')
    if str(r['เตียงเสริม']).strip() == 'มี': note.append('เตียงเสริม')
    if room.startswith('T') and orig: note.append('เดิม: ' + orig)
    if isinstance(r['รายการอาหาร'], str) and r['รายการอาหาร'].strip() not in ('', 'nan'):
        note.append('อาหาร: ' + r['รายการอาหาร'].strip())
    bd = parse_d(r['วันที่จอง'])
    created = (str(bd) if bd else str(ci)) + ' 00:00'
    staff = str(r['ชื่อผู้จอง']).strip() if isinstance(r['ชื่อผู้จอง'], str) else 'นำเข้า'
    out.append([PREFIX + str(i).zfill(4), room, str(ci), str(co), name,
                clean_phone(r['เบอร์โทร']), ' · '.join(note), created, staff])

json.dump(out, open('tools/import-data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'เขียน tools/import-data.json: {len(out)} แถว (prefix {PREFIX})')
print('ต่อไป: ตรวจตัวอย่าง → git commit+push → เปิด /admin/import/ กด "เริ่มนำเข้า"')
