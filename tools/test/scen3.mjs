// เคสแปลกๆ ที่ลูกค้าจริงทำ + คนที่ตั้งใจแหย่ระบบ
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs,opt)=>{ const r=await worker.fetch(new Request('https://x/api?'+qs,opt),env,ctx);
  const ct=r.headers.get('content-type')||'';
  return ct.includes('json')?r.json():{_type:ct,_status:r.status,_len:(await r.arrayBuffer()).byteLength}; };
const jpg=()=>{const b=new Uint8Array(9000);b[0]=0xFF;b[1]=0xD8;return b;};
const post=b=>({method:'POST',body:b});
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(54)+x);};
const hold=(room,ci,co,name='ทดสอบ',phone='0812345678')=>
  J(`action=hold&room=${room}&checkin=${ci}&checkout=${co}&name=${encodeURIComponent(name)}&phone=${phone}&ch=phone`);
await J('action=availability');

console.log('\n── A. วันที่ที่กรอกมั่ว ──');
let r = await J('action=quote&room=R3&checkin=2026-11-10&checkout=2026-11-08');
T('เช็คเอาท์ก่อนเช็คอิน → ปฏิเสธ', r.ok===false, r.error);
r = await J('action=quote&room=R3&checkin=2026-11-10&checkout=2026-11-10');
T('เข้าออกวันเดียวกัน → ปฏิเสธ', r.ok===false, r.error);
r = await J('action=quote&room=R3&checkin=11/10/2026&checkout=2026-11-11');
T('รูปแบบวันที่ผิด → ปฏิเสธ', r.ok===false, r.error);
r = await J('action=quote&room=R99&checkin=2026-11-10&checkout=2026-11-11');
T('ห้องที่ไม่มีจริง → ปฏิเสธ', r.ok===false, r.error);

console.log('\n── B. ราคาข้ามวัน/ข้ามเทศกาล ──');
r = await J('action=quote&room=R3&checkin=2026-11-05&checkout=2026-11-09&bf=0');
T('พัก 4 คืน คร่อมศุกร์+เสาร์', r.ok && r.total===1800*2+2160*2, `${r.total} = 1800x2 + 2160x2`);
r = await J('action=quote&room=R3&checkin=2026-12-31&checkout=2027-01-01&bf=0');
T('คืนปีใหม่ +40% (ไม่ทบกับศุกร์)', r.ok && r.total===2520, `${r.total} บาท`);
r = await J('action=quote&room=R3&checkin=2027-01-02&checkout=2027-01-03&bf=0');
T('คืนเสาร์ที่อยู่ในปีใหม่ = 2,520 ไม่ใช่ 3,024', r.ok && r.total===2520, `${r.total} บาท`);
r = await J('action=quote&room=R3&checkin=2026-12-28&checkout=2026-12-31&bf=0');
T('คร่อมเข้าเทศกาล 28→31', r.ok && r.total===1800+2520+2520, `${r.total} บาท`);

console.log('\n── C. อาหารเช้า / เตียงเสริม ──');
r = await J('action=quote&room=R3&checkin=2026-11-05&checkout=2026-11-06&bf=1&beds=99');
T('ขอเตียงเสริมเกินโควตา → ตัดเหลือสูงสุด', r.beds===2, `ขอ 99 ได้ ${r.beds}`);
T('ยอดคิดจากเตียงที่ได้จริง', r.total===2200+2*300, `${r.total} บาท`);
r = await J('action=quote&room=T1&checkin=2026-11-05&checkout=2026-11-06&bf=1');
T('เต็นท์มีราคารวมอาหารเช้า', r.hasBf===true && r.total===800, `${r.total} บาท`);
r = await J('action=quote&room=T1&checkin=2026-11-05&checkout=2026-11-06&beds=3');
T('เต็นท์เสริมเตียงไม่ได้', r.beds===0 && r.extraMax===0);

console.log('\n── D. ความปลอดภัย ──');
let h = await hold('R4','2026-11-20','2026-11-21','เจ้าของจริง','0899999999');
r = await J(`action=holdstatus&id=${h.id}&tok=ปลอม`);
T('เดากุญแจผิด → ดูสถานะไม่ได้', r.ok===false, r.error);
r = await J(`action=release&id=${h.id}&tok=ปลอม`);
T('เดากุญแจผิด → ยกเลิกของคนอื่นไม่ได้', r.ok===false);
r = await J(`action=payqr&id=${h.id}&tok=ปลอม`);
T('เดากุญแจผิด → ขอ QR ไม่ได้', r._status===404, `HTTP ${r._status}`);
r = await J(`action=slip&id=${h.id}&tok=ปลอม`, post(jpg()));
T('เดากุญแจผิด → แนบสลิปทับไม่ได้', r.ok===false);
r = await J('action=audit');
T('ไม่ล็อกอิน → เรียกหน้าตรวจระบบไม่ได้', r.ok===false, r.error);
r = await J('action=bookings');
T('ไม่ล็อกอิน → ดูรายการจองทั้งหมดไม่ได้', r.ok===false);
r = await J(`action=slipimg&id=${h.id}`);
T('ไม่ล็อกอิน → เปิดดูสลิปไม่ได้', r.ok===false || r._status>=400);

console.log('\n── E. ลูกค้าเปลี่ยนใจ / ทำซ้ำ ──');
r = await J(`action=release&id=${h.id}&tok=${h.tok}`);
T('กดปิดแผงเอง → ปล่อยห้องคืน', r.ok===true);
let h2 = await hold('R4','2026-11-20','2026-11-21','คนถัดไป','0877777777');
T('คนถัดไปจองห้องนั้นได้ทันที', h2.ok===true);
let u1 = await J(`action=slip&id=${h2.id}&tok=${h2.tok}`, post(jpg()));
let u2 = await J(`action=slip&id=${h2.id}&tok=${h2.tok}`, post(jpg()));
T('แนบสลิปซ้ำสองครั้ง → ไม่พัง', u1.ok===true && u2.ok===true);
let cnt = raw.prepare("SELECT COUNT(*) c FROM bookings WHERE id=?").get(String(h2.id)).c;
T('ไม่เกิดรายการซ้ำจากการแนบซ้ำ', cnt===1, `${cnt} แถว`);

console.log('\n── F. เบอร์เดียวจองรัวๆ ──');
const ph='0866666666'; let okCount=0, lastErr='';
for (let i=0;i<4;i++){ const x = await hold('R'+(i+5),'2026-12-05','2026-12-06','คนกดรัว',ph);
  if (x.ok) okCount++; else lastErr = x.error; }
T('จำกัดรายการค้างชำระต่อเบอร์', okCount===2, `จองผ่าน ${okCount} จาก 4 · ${lastErr}`);

console.log('\n── G. ข้อมูลแปลกปลอม ──');
let xss = await hold('R1','2026-11-25','2026-11-26','<script>alert(1)</script>','0855555555');
T('ชื่อมีแท็กสคริปต์ → บันทึกได้ไม่พัง', xss.ok===true);
let back = raw.prepare("SELECT name FROM bookings WHERE id=?").get(String(xss.id)).name;
T('เก็บเป็นข้อความดิบ ไม่ถูกตีความ', back==='<script>alert(1)</script>');
let longName = 'ก'.repeat(500);
let lg = await J(`action=hold&room=R2&checkin=2026-11-25&checkout=2026-11-26&name=${encodeURIComponent(longName)}&phone=0844444444&ch=LINE&chid=${'x'.repeat(200)}`);
T('ชื่อ/ไอดียาวผิดปกติ → ไม่ล้ม', lg.ok===true);
let ct = raw.prepare("SELECT contact FROM bookings WHERE id=?").get(String(lg.id)).contact;
T('ตัดความยาวช่องทางติดต่อ', ct.length<=70, `${ct.length} ตัวอักษร`);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
