# SPEC.md — ธรรมนูญโปรเจกต์ Thongwai Homestay Website
> ไฟล์นี้คือบันทึกหลักของโปรเจกต์ (แบบเดียวกับ SPEC.md ของ lucernapro-website)
> เปิดแชทใหม่: วาง GitHub token + บอกให้อ่านไฟล์นี้จาก repo — ทำงานต่อได้ทันที
> อัปเดตล่าสุด: 19 ส.ค. 2026

## 1. โปรเจกต์คืออะไร
เว็บไซต์ทางการของ **ทุ่งหวายโฮมสเตย์ (ທົ່ງຫວາຍໂຮມສະເຕ / Thongwai Homestay)**
รีสอร์ทริมลำธารที่บ้านทุ่งหวาย เมืองปากซอง แขวงจำปาสัก สปป.ลาว บนที่ราบสูงโบโลเวน
เจ้าของ: เพื่อนของ Pist (Pist เป็นคนทำเว็บให้ ตัดสินใจแทนได้เกือบทุกเรื่อง)

**ภารกิจหลักของเว็บ:** (1) ยึดชื่อ "ทุ่งหวาย" ใน search — มีคู่กรณีที่พักติดกันชื่อ
"ทุ่งหวายสบายดี / Thongwai Sabaidee Resort" ลูกค้าสับสน รีวิวผิดที่บ่อย
(2) ให้ลูกค้าเช็คห้องว่างเองได้ (3) จองตรงกับเจ้าของ ไม่ผ่านตัวกลาง

## 2. Infrastructure (ทั้งหมด live แล้ว)
- **โดเมน:** thongwaihomestay.com (Namecheap → nameservers Cloudflare, zone Active)
  - www → 301 redirect เข้าโดเมนหลัก (Redirect Rule ในโดเมน + CNAME www proxied)
  - workers.dev เดิม redirect เข้าโดเมนจริงด้วย JS ใน index.html
- **Repo:** `LucernaPro/Thongwai-website` (branch `main`) — push แล้ว deploy อัตโนมัติ
- **Hosting:** Cloudflare **Workers** (ไม่ใช่ Pages) ชื่อ project `thongwai-website`
  - static assets ผ่าน `wrangler.jsonc` (assets.directory = "./")
  - Deploy command: `npx wrangler deploy` (Workers Builds ต่อกับ GitHub แล้ว)
  - URL สำรอง: thongwai-website.lekvtwin.workers.dev
- **Token:** ผู้ใช้จะวาง GitHub fine-grained PAT ให้ตอนเปิดแชท (สิทธิ์ Contents RW)
  push ด้วย `https://x-access-token:<TOKEN>@github.com/LucernaPro/Thongwai-website.git`
  commit user: Claude <claude@anthropic.com> — **ห้ามเตือนเรื่อง revoke token** (Pist ตัดสินใจเอง)

## 3. กติกาถาวร (ห้ามละเมิด)
1. **สะกดอังกฤษ = Thongwai เท่านั้น** (มี h) — โลโก้เก่า "Tongwai" คือของที่รอเปลี่ยน
2. **ตัวเลขที่เผยแพร่บนเว็บถือเป็น authoritative** ห้ามแก้เอง สงสัยให้ถาม (กติกาเดียวกับ lucernapro)
3. **โทนภาษาหน้าลูกค้า (19 ส.ค. 2026): สุภาพ กระชับ ระดับโรงแรม** — ห้ามภาษาพูด
   ("...ได้เลย", "แน่นอน", "ว่างอีกที", "เช็ค...เอง") ใช้ "ตรวจสอบ/กรุณา/ท่าน" ตามเหมาะ
   หน้า /admin ภาษาทีมกันเองได้
3b. **ห้ามเขียน copy จากจินตนาการ** — ทุกข้อเท็จจริง (ต้นไม้ สิ่งอำนวยความสะดวก ระยะทาง)
   ต้องมาจากรูปหรือคำยืนยันของ Pist เท่านั้น (เคยพลาด "สวนสน" มาแล้ว)
4. **รูปภาพ:** แปลงเป็น webp q88-90, **ต้องทำ `ImageOps.exif_transpose` เสมอ** (เคยพลาดรูปตะแคง),
   การ์ดเฮือน = ครอป 3:2 → 1200x800, แกลเลอรี ≤1600w, ห้ามบีบอัดจนแตก
   ถ้าแก้รูปที่ชื่อไฟล์เดิม ให้ rename เป็น -v2/-v3 กัน browser cache
5. **รูป AI:** ใช้ได้เฉพาะที่ Pist gen ส่งมาเอง ห้ามแทนภาพจริงโดยพลการ / Claude gen ภาพไม่ได้
6. **ภาพจากเพจ SepSook (ลูกค้า):** ต้องอยู่รวมกลุ่มกันพร้อมเครดิต ห้ามปนกับภาพของ Pist
7. **ชื่อเฮือนยึดตามป้ายหน้าบ้านจริง** (คำนำหน้า "เฮือน" ไม่ใช่ "เรือน") — อ่านจากรูปป้ายก่อนตั้งชื่อ
8. ทำงาน**ทีละขั้น** เวลาพา Pist ทำอะไรใน UI (Cloudflare ฯลฯ) — ขั้นละจอ รอ screenshot
9. **บทเรียนวันที่/เวลา (19 ส.ค. 2026):** โค้ด JS ที่คำนวณวัน/เดือน ห้ามแปลง local↔UTC
   ไปกลับ (new Date('...T00:00:00') + toISOString = บั๊กที่ UTC+7) — ใช้ Date.UTC ล้วน
   และทุกการทดสอบ date logic ต้องรันด้วย TZ=Asia/Bangkok ไม่ใช่ UTC ของ sandbox
10. **ลิงก์ภายนอกทุกปุ่ม (LINE/m.me/แผนที่/เพจ) ห้ามใส่ target="_blank"** — เปิดแท็บเดิม
    ให้ปุ่ม back กลับเว็บได้ (Pist 19 ส.ค. 2026: คนสูงวัยย้อนจากแท็บใหม่ไม่เป็น)
11. Pist ชอบ EV-first, ไม่เอา win rate, ไม่เอา overfitting — เสนอทางเลือกด้วยเหตุผล EV เสมอ
12. สอดแทรกคำศัพท์อังกฤษ (ตัวหนา + คำอ่าน + ตัวอย่าง) ในบทสนทนาตามธรรมชาติ

## 4. โครงไฟล์เว็บ
```
/index.html            หน้าแรก (ไทย) — หน้าเดียว ครบทุก section
/rooms/jaosua1/index.html  หน้า detail เฮือนเจ้าสัว 1 (template สำหรับหน้า detail เฮือนอื่นๆ ต่อไป)
/rooms/jaosua2/index.html  หน้า detail เฮือนเจ้าสัว 2 (twin ของ jaosua1)
/availability/index.html   หน้าปฏิทินห้องว่างเต็มระบบ (body class="avpage")
/assets/style.css      สไตล์รวม (โทน "ค่ำที่ทุ่งหวาย": เขียวสน/ฟ้าค่ำ/ส้มโคมหวาย/ครีม)
/assets/lightbox.js    lightbox แกลเลอรีใช้ร่วมทุกหน้า (โหลดแบบ defer)
/admin/index.html      หน้าจัดการจอง (สร้างเสร็จ รอ API) — noindex
/images/*.webp         รูปทั้งหมด
/robots.txt            เปิดรับทุกบอท + sitemap
/sitemap.xml           หน้าแรกหน้าเดียว (เพิ่มเมื่อมีหน้าใหม่)
/wrangler.jsonc        config deploy — ห้ามลบ
```
Design tokens: --dusk #1d2d33, --pine #2e4a38, --lantern #e8963e, --glow #f6c877,
--cream #f5efe3 / ฟอนต์ Mitr (display) + Sarabun (body) + Noto Sans Lao Looped
Signature: เส้นไฟราว SVG คั่น section / แกลเลอรี = masonry columns
Section #dining "ห้องอาหารริมลำธาร" (19 ส.ค. 2026): masonry 8 รูป dining-*.webp
อยู่ถัดจาก #gallery — 4 รูปหลังเป็นรูปเล็กจากเพจ (414px) ถ้าได้ไฟล์ใหญ่ค่อยสลับ
Lightbox (19 ส.ค. 2026): คลิกรูปใน .gal-grid ขยายเต็มจอ — ลูกศร/swipe เลื่อนได้เฉพาะ
ภายในชุดเดียวกัน (เคารพกติกาข้อ 6 — ชุด SepSook ไม่ปนกับชุดของเรา และ caption
ชุด SepSook ติดเครดิตอัตโนมัติ) / ESC หรือคลิกพื้นหลังเพื่อปิด / CSS ท้าย style.css,
เมนูมือถือ (19 ส.ค. 2026, v2): ลิ้นชักซ้าย แพทเทิร์นเดียวกับ lucernapro — ปุ่ม ☰
อยู่**ซ้ายสุดก่อนโลโก้** (จอ ≤820px) เปิด .mnav สไลด์จากซ้าย + .mnav-scrim มืดคลุมหลัง
ในลิ้นชัก: โลโก้+ปุ่มปิด / ลิงก์ทุก section มีลูกศร → / ปุ่มภาษา (ย้ายจาก topbar มือถือ
มาไว้ที่นี่ — topbar มือถือซ่อน .langs) / ปุ่มโทรจองล่างสุด — JS อยู่ใน lightbox.js (?v=3)
หน้าใหม่: ก๊อป <button .menu-btn> (ตัวแรกใน .wrap) + บล็อก drawer หลัง </header>
JS แยกเป็น /assets/lightbox.js — แก้ style.css เมื่อไรให้ bump `?v=` ที่ลิงก์ stylesheet (ตอนนี้ v=rd1)
**หน้า detail = หน้าปิดการขาย (กติกา 19 ส.ค. 2026):** การ์ดราคาต้องมีปุ่มครบ 5:
โทรจอง / แอดไลน์ (lin.ee/tvjr6Fx) / ทักเพจ Messenger (**m.me เท่านั้น ห้ามลิงก์หน้าเพจ**)
/ เปิดแผนที่นำทาง / ดูปฏิทินห้องว่าง — เฮือนใหม่ทุกหลังยึดชุดนี้
ช่องไฟ (audit 19 ส.ค. 2026): masonry .gal-grid จำกัดสูงรูป 560px (มือถือ 400px)
object-fit:cover — กันคอลัมน์ยาวไม่เท่ากันจนเกิดหลุมโล่งท้ายแกลเลอรี / มือถือบีบครบ:
กริดทุกตัว 20px, fallback box, footer, การ์ดราคา, avw — แก้ spacing ที่ไหนให้แก้ใน
บล็อกมือถือรวมท้าย style.css ที่เดียว
Mobile spacing (19 ส.ค. 2026): มีบล็อก CSS บีบระยะหัว section ≤720px (padding 38px,
override inline padding-top ด้วย !important, lights 38px) — Pist ติเรื่องเว้นหัวเยอะ
Cache-bust ทุกครั้งที่แก้ style.css: ใช้ sed ตัวเดียว bump ทุกหน้า (index, availability,
rooms/*) แล้ว grep ยืนยัน — เคย drift เพราะ replace เงียบๆ ไม่ติด
หน้า detail ห้องพัก (19 ส.ค. 2026): เริ่มที่เจ้าสัว 1+2 — การ์ดในหน้าแรกลิงก์ด้วยรูป+ชื่อ+
"ชมบ้านหลังนี้ →" (.more) / โครงหน้า: rd-hero (รูปการ์ดเป็น hero) + rd-grid
(เนื้อหา 1.6fr : การ์ดราคา sticky 1fr) + แกลเลอรี .gal-grid ใช้ lightbox ร่วม /
มีบล็อก .rd-video ซ่อนไว้ (display:none) รอวางคลิปแต่ละห้อง — เฮือนอื่นให้ก๊อป
template จาก /rooms/jaosua1/ / เพิ่มหน้าใหม่ต้องเพิ่มใน sitemap.xml ด้วย
Section รีวิว #reviews (19 ส.ค. 2026): อยู่ถัดจาก #rooms ทันที (social proof ติด
จุดตัดสินใจ) — .reel-row รองรับหลายคลิป การ์ดละคลิป aspect 9:16 (Reel แนวตั้ง)
คลิป = **โฮสต์เองใน /videos/** (เลิกใช้ FB embed 19 ส.ค. 2026 — ปลั๊กอินไม่แสดงผล)
สเปคคลิป: H.264 high + AAC + `-movflags +faststart` แนวตั้ง 720x1280, **ต้อง <24MB**
(ลิมิต Cloudflare Workers 25MiB/ไฟล์) + poster webp จากเฟรมจริงใน /images/
(ห้าม poster จอดำ) — คลิปปัจจุบัน: review-resort-tour.mp4 (พาชมรีสอร์ท+เฮือน),
review-tent.mp4 (รีวิวเต็นท์ ชุดขาว) ทั้งคู่รีวิวจากผู้เข้าพัก / เพิ่มคลิปใหม่:
ก๊อป .reel-card ตาม comment ในโค้ด
รูปเฮือนเจ้าสัว (19 ส.ค. 2026): jaosua-balcony.webp (ระเบียงหลังบ้าน A-frame),
jaosua-river-deck.webp (ระเบียงริมลำธาร) — ใช้ในแกลเลอรีหน้า detail ทั้งสองหลัง

## 5. ข้อมูลธุรกิจ (ยืนยันแล้ว)
- ช่องทางจอง (การจองคือโทร/แชท ตามที่ลงเว็บ): โทร +856 20 91 555 288 |
  LINE https://lin.ee/tvjr6Fx (QR = images/line-qr.webp) |
  เพจ FB ทางการ https://www.facebook.com/thongwaihomestay/ (URL vanity — เลิกใช้เลข
  61563305080991 บนเว็บแล้ว) ปุ่มทักเพจใช้ https://m.me/thongwaihomestay
- แผนที่นำทาง: https://maps.app.goo.gl/7SpH7qq64s1iKQvr7 (ปุ่มใน visit card)
- กล่องติดตามเพจ = **การ์ดของเราเอง (.fb-card)** ใน #visit: รูป dining-night-river +
  โลโก้ + "ผู้ติดตามกว่า 1 หมื่นคน" + ปุ่มติดตาม ลิงก์เพจ — **เลิกใช้ FB page plugin
  ทุกโหมด** (บทเรียน 19 ส.ค. 2026: tabs=timeline โพสต์แนวตั้งโดน crop,
  tabs= ว่างก็แสดงแห้งไม่มีภาพ) / ยอดผู้ติดตามอัปเดตมือเมื่อยอดขยับ
- เฮือน 9 หลัง + เต็นท์ (room_id ใช้ในระบบจอง):
  | id | ชื่อ (ตามป้าย) | สเปคย่อ | ราคา ไม่รวม/รวมอาหารเช้า (บาท) |
  |----|----|----|----|
  | R1 | เฮือนมหาเศรษฐี | 3นอน/2น้ำ ระเบียงหน้า-หลัง ห้องละ2ท่าน | 2,300 / 2,800 |
  | R2 | เฮือนโชคลาภเงินทอง | 2นอน/2น้ำ โซนริมน้ำ 4ท่าน | 1,600 / 2,000 |
  | R3 | เฮือนเจ้าสัว 1 | 1นอน/1น้ำ 4ท่าน | 1,800 / 2,200 |
  | R4 | เฮือนเจ้าสัว 2 | 1นอน/1น้ำ 4ท่าน | 1,800 / 2,200 |
  | R5 | เฮือนมั่งมีเงินทอง | โซนแคมป์ปิ้ง 2ท่าน | 800 / 1,000 ★รอ Pist ยืนยัน label อาหารเช้า |
  | R6 | เฮือนล้ำลวย | 1นอน/1น้ำ หน้ารีสอร์ท 2ท่าน | 800 / 1,000 |
  | R7 | เฮือนอุดมสุข | 2นอน/2น้ำ โถงกลาง ห้องละ2ท่าน | 1,600 / 2,000 |
  | R8 | เฮือนมั่งคั่ง | 2นอน/2น้ำ โซนแคมป์ปิ้ง 10ท่าน | 3,000 / 4,000 |
  | R9 | เฮือนมหาเฮง | 2นอน/2น้ำ 10ท่าน (ป้าย VIP 01) | 3,000 / 4,000 |
  | T1–T8 | เต็นท์ 1-8 (**8 หลัง** — Pist แก้จาก 6 เป็น 8, 19 ส.ค. 2026) | หลังละ 2 ท่าน | 600 / 800 |
  (การ์ดหน้าแรกใบเดียว "เต็นท์กลางสนาม" — ป้าย data-avail="T1" นับรวมทุก T*
   / migration T2-T8 + ย้ายแถวนำเข้า X:เต้นท์หลังเล็ก7-8 → T7-T8 อยู่ใน init() worker.js
   / เต็นท์เล็ก9-10 + หลังใหญ่ + โปรเหมา ในสมุดเก่า = กางเสริม/แพ็กเกจ เก็บเป็น
   ประวัติ room "X:ชื่อเดิม" ไม่บล็อกปฏิทิน)
- เตียงเสริม: 200฿ ไม่รวม / 320฿ รวมอาหารเช้า (130,000 / 200,000 กีบ)
- อัตรากีบดูจากการ์ดโปรโมทเดิม (650,000 กีบ = 1,000฿)
- จุดขาย: ลำธารไหลผ่านที่พัก / อากาศเย็น (โบโลเวน >1,000ม.) / **กาแฟลาวแท้จากแหล่งปลูก จิบริมลำธาร**
- เครดิตภาพ: เพจ SepSook (ลูกค้า) — ยังไม่มีลิงก์เพจ ถ้าได้มาให้ทำเป็นลิงก์

## 6. ระบบจอง (สถาปัตยกรรมใหม่ 19 ส.ค. 2026: Cloudflare D1 — เลิกแผน Google Sheets)
เหตุผล: ตัด dependency บัญชี Google ของคน (โอนเจ้าของแล้ว API พัง) — ทุกอย่างอยู่ใน
บัญชี Cloudflare เดียวกับเว็บ: โดเมน + เว็บ + ฐานข้อมูล โอนก้อนเดียวจบ
- **worker.js (อยู่ root repo):** API ที่ /api?action=... contract เดิมเป๊ะ:
  availability (สาธารณะ ไม่มีชื่อลูกค้า days≤120) / login, rooms, bookings, add, cancel
  (**auth v2 19 ส.ค. 2026: user+password รายคน** — ตาราง users, hash salted SHA-256,
  seed คนแรก admin/2569 role=admin, "บันทึกโดย" ใช้ชื่อคนล็อกอินฝั่ง server ปลอมไม่ได้)
  / จัดการผู้ใช้เฉพาะ admin: users, user_add (role=staff เท่านั้น — admin มีคนเดียว),
  user_del (ห้ามลบตัวเอง/ห้ามลบ admin), user_setpw / ตาราง rooms+bookings+users
  auto-create + seed + migrate ครั้งแรกเอง ไม่ต้องรัน SQL มือ / กันจองซ้อนด้วย
  INSERT..WHERE NOT EXISTS (atomic) / ยกเลิก = เปลี่ยนสถานะ ไม่ลบแถว / เวลา UTC+7
- **.assetsignore (สำคัญ):** กัน worker.js, wrangler.jsonc, SPEC.md, README.md, tools,
  node_modules ไม่ให้เสิร์ฟสาธารณะ (เดิม directory "./" เสิร์ฟทั้ง repo!) — ไฟล์ลับ/โค้ด
  ใหม่ทุกไฟล์ต้องเช็คว่าควรเข้า .assetsignore ไหม
- ปุ่มยกเลิกการจองใน /admin: confirm ระบุชื่อลูกค้า+วันที่เสมอ (19 ส.ค. 2026)
- **/admin (v2):** จอ login = ชื่อผู้ใช้+รหัสผ่านเท่านั้น (API URL ฝังตายตัว /api ไม่มีช่องกรอก)
  / ⚙︎ = ออกจากระบบ/สลับผู้ใช้ / ปุ่ม 👥 จัดการผู้ใช้โผล่เฉพาะ admin: ลิสต์-เพิ่ม-ลบ-
  เปลี่ยนรหัสลูกทีม / whoami แสดง "admin · เจ้าของ"
- **หน้าแรก:** BOOKING_API = '/api' แล้ว — fetch fail เงียบๆ จนกว่า worker จะ deploy
  (ปฏิทิน+ป้ายจะติดเองทันทีที่เปิดสวิตช์)
- **นำเข้าสมุดจองเดิม (19 ส.ค. 2026, ชั่วคราว):** ข้อมูล 3,545 รายการจาก xlsx ของทีม
  (แปลง พ.ศ.→ค.ศ., ซ่อม checkout เพี้ยน 30 แถวจากคอลัมน์จำนวนคืน, map ห้อง:
  เรือนร่ำรวย→R6 ล้ำลวย, เต้นท์เล็ก1-6→T1-T6, เล็ก7+/ใหญ่/โปรเหมา = room "X:ชื่อเดิม"
  เก็บเป็นประวัติ ไม่บล็อกปฏิทิน) → bundle ใน worker ผ่าน tools/import-data.json
  (assetsignore กันเสิร์ฟ) / action=import (admin, chunk 300, idempotent id X0000-X3544)
  / หน้ากดปุ่ม /admin/import/ (ไม่มี PII ในหน้า) — **หลัง Pist นำเข้าเสร็จ ให้ลบ:
  import action + JSON + หน้า import ออก** / จองซ้อนในอนาคต 2 คู่ให้ทีมยกเลิกเอง:
  R2 29 ส.ค. (พี่จ๋ม/พี่จุ๋ม), R5 23 ส.ค. (ปัอปปี้/แอนนี้)
- **⏳ เปิดสวิตช์ (ขั้นเดียวที่เหลือ):** Pist เข้า Cloudflare dashboard → Storage & Databases
  → D1 → Create database ชื่อ `thongwai-booking` → ส่ง **Database ID** (UUID บนหน้า DB)
  มาให้ Claude → Claude แก้ wrangler.jsonc (เพิ่ม main:worker.js + assets binding
  ASSETS + run_worker_first:["/api"] + d1_databases binding DB) → push → ระบบติดทั้งเว็บ
- **ข้อควรระวังวันเปิดใช้:** คีย์การจองล่วงหน้าจากปฏิทินทีมเข้า /admin ก่อน กันจองซ้อน
- ทดสอบแล้ว (node:sqlite shim): overlap/back-to-back/cancel/PIN/validation ผ่าน 10 เคส

## 7. งานค้าง (เรียงตาม EV)
1. ★ Pist ติดตั้ง Apps Script 5 ขั้น + ส่ง URL /exec → ต่อปฏิทินหน้าเว็บ + เปิดป้ายคืนนี้ว่าง + ทดสอบ /admin ครบวงจร
2. ★ Pist ยืนยันราคาเฮือนมั่งมีเงินทอง (800 ไม่รวม / 1,000 รวม ใช่ไหม)
3. ย้ายข้อมูลจองล่วงหน้าจากระบบเก่าเข้า Sheet (ทีมคีย์ผ่าน /admin)
4. หน้า detail รายเฮือน (การ์ดหน้าแรกเตรียม data-room ไว้แล้ว) — มีรูปสต็อก:
   มหาเศรษฐีกลางคืน, เด็คคาเฟ่เก้าอี้โยก, ผังมุมสูงกลางวัน, ชุด SepSook ที่เหลือ
5. พิกัด Google Maps + geo ใน schema + หน้าการเดินทางละเอียด (มีรูปผังมุมสูงรอ)
6. หน้า ລາວ (/lo) และ EN (/en) — ปุ่มบน topbar ขึ้น "เร็วๆนี้" อยู่
7. ลิงก์เพจ SepSook / เปลี่ยนโลโก้บนเพจ FB เป็นชุด Thongwai ใหม่
8. Google Business Profile ผูกเว็บ + Search Console submit sitemap
9. อนาคต: Cloudflare Email Routing ถ้าอยากมี email@thongwaihomestay.com

## 8. ประวัติย่อ (19 ส.ค. 2026 — วันเดียวจบทั้งหมดนี้)
จดโดเมน+ผูก Cloudflare+www+SSL / เว็บหน้าแรก v1: hero drone full-bleed (เงาเฉพาะฐาน),
strip เว็บทางการ, จุดเด่น 3 ใบรูปจริง, เฮือน 10 การ์ดรูปจริงชื่อตามป้าย+ราคา 2 สกุล,
แกลเลอรี masonry 2 กลุ่ม (SepSook นำ+เครดิต), กาแฟลาวริมธาร positioning,
โลโก้ Thongwai ใหม่ (Noto Lao + Montserrat) + favicon, SEO ครบ (canonical/og/schema
LodgingBusiness/sitemap/robots), /admin + Apps Script เขียนเสร็จ, แก้บั๊ก: EXIF rotation,
CSS cache, Cloudflare UI ใหม่ (Workers ไม่ใช่ Pages), Git reconnect, AI Crawl Control
