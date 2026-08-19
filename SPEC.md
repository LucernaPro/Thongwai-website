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
3. **ห้ามเขียน copy จากจินตนาการ** — ทุกข้อเท็จจริง (ต้นไม้ สิ่งอำนวยความสะดวก ระยะทาง)
   ต้องมาจากรูปหรือคำยืนยันของ Pist เท่านั้น (เคยพลาด "สวนสน" มาแล้ว)
4. **รูปภาพ:** แปลงเป็น webp q88-90, **ต้องทำ `ImageOps.exif_transpose` เสมอ** (เคยพลาดรูปตะแคง),
   การ์ดเฮือน = ครอป 3:2 → 1200x800, แกลเลอรี ≤1600w, ห้ามบีบอัดจนแตก
   ถ้าแก้รูปที่ชื่อไฟล์เดิม ให้ rename เป็น -v2/-v3 กัน browser cache
5. **รูป AI:** ใช้ได้เฉพาะที่ Pist gen ส่งมาเอง ห้ามแทนภาพจริงโดยพลการ / Claude gen ภาพไม่ได้
6. **ภาพจากเพจ SepSook (ลูกค้า):** ต้องอยู่รวมกลุ่มกันพร้อมเครดิต ห้ามปนกับภาพของ Pist
7. **ชื่อเฮือนยึดตามป้ายหน้าบ้านจริง** (คำนำหน้า "เฮือน" ไม่ใช่ "เรือน") — อ่านจากรูปป้ายก่อนตั้งชื่อ
8. ทำงาน**ทีละขั้น** เวลาพา Pist ทำอะไรใน UI (Cloudflare ฯลฯ) — ขั้นละจอ รอ screenshot
9. Pist ชอบ EV-first, ไม่เอา win rate, ไม่เอา overfitting — เสนอทางเลือกด้วยเหตุผล EV เสมอ
10. สอดแทรกคำศัพท์อังกฤษ (ตัวหนา + คำอ่าน + ตัวอย่าง) ในบทสนทนาตามธรรมชาติ

## 4. โครงไฟล์เว็บ
```
/index.html            หน้าแรก (ไทย) — หน้าเดียว ครบทุก section
/rooms/jaosua1/index.html  หน้า detail เฮือนเจ้าสัว 1 (template สำหรับหน้า detail เฮือนอื่นๆ ต่อไป)
/rooms/jaosua2/index.html  หน้า detail เฮือนเจ้าสัว 2 (twin ของ jaosua1)
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
Lightbox (19 ส.ค. 2026): คลิกรูปใน .gal-grid ขยายเต็มจอ — ลูกศร/swipe เลื่อนได้เฉพาะ
ภายในชุดเดียวกัน (เคารพกติกาข้อ 6 — ชุด SepSook ไม่ปนกับชุดของเรา และ caption
ชุด SepSook ติดเครดิตอัตโนมัติ) / ESC หรือคลิกพื้นหลังเพื่อปิด / CSS ท้าย style.css,
เมนูมือถือ hamburger (19 ส.ค. 2026): ปุ่ม ☰ ใน topbar โผล่ที่จอ ≤820px กดกาง nav
เป็น dropdown (toggle JS อยู่ใน lightbox.js — ไฟล์ shared JS ของทั้งเว็บ อ้างด้วย ?v=2)
หน้าใหม่ทุกหน้าต้องมีปุ่ม .menu-btn หลัง </nav> เสมอ
JS แยกเป็น /assets/lightbox.js — แก้ style.css เมื่อไรให้ bump `?v=` ที่ลิงก์ stylesheet (ตอนนี้ v=rd1)
หน้า detail ห้องพัก (19 ส.ค. 2026): เริ่มที่เจ้าสัว 1+2 — การ์ดในหน้าแรกลิงก์ด้วยรูป+ชื่อ+
"ชมบ้านหลังนี้ →" (.more) / โครงหน้า: rd-hero (รูปการ์ดเป็น hero) + rd-grid
(เนื้อหา 1.6fr : การ์ดราคา sticky 1fr) + แกลเลอรี .gal-grid ใช้ lightbox ร่วม /
มีบล็อก .rd-video ซ่อนไว้ (display:none) รอวางคลิปแต่ละห้อง — เฮือนอื่นให้ก๊อป
template จาก /rooms/jaosua1/ / เพิ่มหน้าใหม่ต้องเพิ่มใน sitemap.xml ด้วย
Section รีวิว #reviews (19 ส.ค. 2026): อยู่ถัดจาก #rooms ทันที (social proof ติด
จุดตัดสินใจ) — .reel-row รองรับหลายคลิป การ์ดละคลิป aspect 9:16 (Reel แนวตั้ง)
embed ผ่าน facebook.com/plugins/video.php (href ต้อง URL-encode) — คลิปแรก:
รีวิวเฮือนมหาเศรษฐี reel/1776247666851495 / เพิ่มคลิปใหม่: ก๊อป .reel-card ตาม
comment ในโค้ด
รูปเฮือนเจ้าสัว (19 ส.ค. 2026): jaosua-balcony.webp (ระเบียงหลังบ้าน A-frame),
jaosua-river-deck.webp (ระเบียงริมลำธาร) — ใช้ในแกลเลอรีหน้า detail ทั้งสองหลัง

## 5. ข้อมูลธุรกิจ (ยืนยันแล้ว)
- โทร: +856 20 91 555 288 | Facebook: facebook.com/61563305080991
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
  | T1 | เต็นท์กลางสนาม | เต็นท์พร้อมฟลายชีท กลางสนาม | 600 / 800 (ยืนยัน 19 ส.ค. 2026) |
- เตียงเสริม: 200฿ ไม่รวม / 320฿ รวมอาหารเช้า (130,000 / 200,000 กีบ)
- อัตรากีบดูจากการ์ดโปรโมทเดิม (650,000 กีบ = 1,000฿)
- จุดขาย: ลำธารไหลผ่านที่พัก / อากาศเย็น (โบโลเวน >1,000ม.) / **กาแฟลาวแท้จากแหล่งปลูก จิบริมลำธาร**
- เครดิตภาพ: เพจ SepSook (ลูกค้า) — ยังไม่มีลิงก์เพจ ถ้าได้มาให้ทำเป็นลิงก์

## 6. ระบบจอง (สถานะ: โครงเสร็จ รอ Pist ติดตั้ง Apps Script)
สถาปัตยกรรม: Google Sheet = database → Apps Script = API (ฟรี) → เว็บ 2 หน้า
- **สคริปต์เขียนเสร็จแล้ว** (เคยส่งเป็นไฟล์ thongwai-booking-script.gs — ถ้าเปิดแชทใหม่
  แล้วไม่มีไฟล์ ให้เขียนใหม่ตามสเปคนี้): Sheet 2 tabs (Rooms / Bookings 10 คอลัมน์รวม "บันทึกโดย"),
  `setup()` สร้างตารางเอง, doGet actions: availability (สาธารณะ ไม่มีชื่อลูกค้า) /
  rooms, bookings, add, cancel (ต้องมี PIN), กันจองซ้อนด้วย LockService, TZ Asia/Vientiane,
  วันที่เป็น text yyyy-MM-dd, id = B+timestamp
- **ขั้นติดตั้งฝั่ง Pist (ค้างอยู่):** สร้าง Sheet "Thongwai Booking" → Extensions→Apps Script
  → วางโค้ด → เปลี่ยน PIN → Run setup → Deploy Web app (Execute as Me / Anyone) → ส่ง URL /exec
- **/admin (live แล้ว):** จอตั้งค่าครั้งแรก (API URL + PIN + ชื่อผู้ใช้ → localStorage),
  ผังแบบตั๋วหนัง แถว=ห้อง คอลัมน์=วัน (มือถือ 10 วัน คอม 21 วัน), แท่งส้ม=จอง กดดู/ยกเลิก/โทร,
  กดช่องว่าง=ฟอร์มจอง, เลื่อน ←7วัน→, หลายคนใช้ PIN เดียว แยกด้วยชื่อผู้บันทึก
- **หน้าแรก:** มี stub ป้าย "คืนนี้ว่าง/เต็ม" ทุกการ์ดเฮือน — เปิดใช้โดยวาง URL /exec
  ในตัวแปร `BOOKING_API` (script ท้าย index.html)
- **ข้อควรระวังวันเปิดใช้:** ต้องคีย์การจองล่วงหน้าจากระบบเก่า (แอปปฏิทินที่ทีมใช้อยู่)
  เข้าระบบใหม่ก่อน ไม่งั้นจองซ้อน

## 7. งานค้าง (เรียงตาม EV)
1. ★ Pist ติดตั้ง Apps Script 5 ขั้น + ส่ง URL /exec → ต่อปฏิทินหน้าเว็บ + เปิดป้ายคืนนี้ว่าง + ทดสอบ /admin ครบวงจร
2. ★ Pist ยืนยันราคาเฮือนมั่งมีเงินทอง (800 ไม่รวม / 1,000 รวม ใช่ไหม)
3. ย้ายข้อมูลจองล่วงหน้าจากระบบเก่าเข้า Sheet (ทีมคีย์ผ่าน /admin)
4. หน้า detail รายเฮือน (การ์ดหน้าแรกเตรียม data-room ไว้แล้ว) — มีรูปสต็อก:
   มหาเศรษฐีกลางคืน, เด็คคาเฟ่เก้าอี้โยก, ผังมุมสูงกลางวัน, ชุด SepSook ที่เหลือ
5. พิกัด Google Maps + geo ใน schema + หน้าการเดินทางละเอียด (มีรูปผังมุมสูงรอ)
6. หน้า ລາວ (/lo) และ EN (/en) — ปุ่มบน topbar ขึ้น "เร็วๆนี้" อยู่
7. ราคาเต็นท์ / ลิงก์เพจ SepSook / เปลี่ยนโลโก้บนเพจ FB เป็นชุด Thongwai ใหม่
8. Google Business Profile ผูกเว็บ + Search Console submit sitemap
9. อนาคต: Cloudflare Email Routing ถ้าอยากมี email@thongwaihomestay.com

## 8. ประวัติย่อ (19 ส.ค. 2026 — วันเดียวจบทั้งหมดนี้)
จดโดเมน+ผูก Cloudflare+www+SSL / เว็บหน้าแรก v1: hero drone full-bleed (เงาเฉพาะฐาน),
strip เว็บทางการ, จุดเด่น 3 ใบรูปจริง, เฮือน 10 การ์ดรูปจริงชื่อตามป้าย+ราคา 2 สกุล,
แกลเลอรี masonry 2 กลุ่ม (SepSook นำ+เครดิต), กาแฟลาวริมธาร positioning,
โลโก้ Thongwai ใหม่ (Noto Lao + Montserrat) + favicon, SEO ครบ (canonical/og/schema
LodgingBusiness/sitemap/robots), /admin + Apps Script เขียนเสร็จ, แก้บั๊ก: EXIF rotation,
CSS cache, Cloudflare UI ใหม่ (Workers ไม่ใช่ Pages), Git reconnect, AI Crawl Control
