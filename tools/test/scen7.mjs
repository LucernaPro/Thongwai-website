// รอบเจ็ด: พนักงานมือใหม่กดมั่ว — เคสที่เกิดจริงหน้างาน
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs,opt)=>{ const r=await worker.fetch(new Request('https://x/api?'+qs,opt),env,ctx);
  const ct=r.headers.get('content-type')||''; return ct.includes('json')?r.json():{_type:ct,_status:r.status}; };
const jpg=()=>{const b=new Uint8Array(9000);b[0]=0xFF;b[1]=0xD8;return b;};
const post=b=>({method:'POST',body:b});
const OWNER='user=admin&pass=2569';
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(52)+x);};
const E=s=>encodeURIComponent(s);
const add=(room,ci,co,name,phone='0812345678',note='')=>
  J(`${OWNER}&action=add&room=${room}&checkin=${ci}&checkout=${co}&name=${E(name)}&phone=${E(phone)}&note=${E(note)}`);
await J('action=availability');

console.log('\n── AD. กดปุ่มบันทึกรัว ──');
const twice = await Promise.all([
  add('R1','2027-02-10','2027-02-11','กดสองที'),
  add('R1','2027-02-10','2027-02-11','กดสองที'),
]);
T('บันทึกเข้าแค่ครั้งเดียว', twice.filter(x=>x.ok).length===1, `สำเร็จ ${twice.filter(x=>x.ok).length} จาก 2`);
let n = raw.prepare("SELECT COUNT(*) c FROM bookings WHERE room='R1' AND checkin='2027-02-10' AND status='จอง'").get().c;
T('ฐานข้อมูลมีแถวเดียว', n===1, `${n} แถว`);
T('ครั้งที่สองบอกเหตุผลชัด', /ไม่ว่าง|จองแล้ว|ชนกับ/.test(twice.find(x=>!x.ok).error||''), twice.find(x=>!x.ok).error);

console.log('\n── AE. พิมพ์วันที่ผิดปี ──');
let r = await add('R2','2025-02-10','2025-02-11','พิมพ์ปีผิด');
T('จองย้อนหลังเข้าไปได้ (ตั้งใจให้คีย์ย้อนหลังได้)', r.ok===true, r.error||'');
const pastId = r.id;
let a = await J(`${OWNER}&action=audit`);
let oldCheck = a.checks.find(c=>c.title==='วันที่ไม่ถูกต้อง');
T('หน้าตรวจไม่เตือนผิดๆ กับรายการย้อนหลัง', oldCheck.count===0);
await J(`${OWNER}&action=cancel&id=${pastId}`);

console.log('\n── AF. จองยาวผิดปกติ ──');
r = await add('R2','2027-03-01','2028-03-01','จองข้ามปี');
T('จอง 365 คืนเข้าได้ (ระบบไม่ล้ม)', r.ok===true, r.error||'');
let q = await J('action=quote&room=R2&checkin=2027-03-01&checkout=2028-03-01');
T('คิดราคา 365 คืนได้ ไม่ค้าง', q.ok===true && q.nights===366, `${q.nights} คืน · ${q.total} บาท`);
await J(`${OWNER}&action=cancel&id=${r.id}`);

console.log('\n── AG. สลับช่องกรอก / พิมพ์แปลกๆ ──');
r = await add('R3','2027-02-10','2027-02-11','0812345678','สมชาย ใจดี');
T('เอาเบอร์ใส่ช่องชื่อ → ยังบันทึกได้ (ระบบไม่ตัดสินแทน)', r.ok===true);
let row = raw.prepare('SELECT name,phone FROM bookings WHERE id=?').get(String(r.id));
T('เก็บตามที่พิมพ์จริง ไม่สลับให้เอง', row.name==='0812345678' && row.phone==='สมชาย ใจดี');
r = await add('R4','2027-02-10','2027-02-11','คุณสมศรี','๐๘๑๒๓๔๕๖๗๘');
T('เลขไทยในช่องเบอร์ → บันทึกได้', r.ok===true);
r = await add('R5','2027-02-10','2027-02-11','ลูกค้า 🎉🏠 VIP','0899999999');
T('ชื่อมีอิโมจิ → บันทึกได้ไม่พัง', r.ok===true);
row = raw.prepare('SELECT name FROM bookings WHERE id=?').get(String(r.id));
T('อิโมจิเก็บครบไม่เพี้ยน', row.name.includes('🎉'), row.name);

console.log('\n── AH. ย้ายห้องแบบงงๆ ──');
let mv0 = await add('R6','2027-02-15','2027-02-16','ย้ายไปย้ายมา');
r = await J(`${OWNER}&action=move&id=${mv0.id}&room=R6&checkin=2027-02-15&checkout=2027-02-16`);
T('ย้ายไปที่เดิมเป๊ะ → ไม่พัง', r.ok===true, r.error||'');
r = await J(`${OWNER}&action=move&id=${mv0.id}&room=R6&checkin=2027-02-16&checkout=2027-02-15`);
T('ย้ายแล้วใส่วันกลับหัว → ปฏิเสธ', r.ok===false, r.error||'');
row = raw.prepare('SELECT checkin,checkout FROM bookings WHERE id=?').get(String(mv0.id));
T('วันเดิมไม่ถูกทำลาย', row.checkin==='2027-02-15' && row.checkout==='2027-02-16', `${row.checkin}→${row.checkout}`);
r = await J(`${OWNER}&action=move&id=${mv0.id}&room=RZZ&checkin=2027-02-15&checkout=2027-02-16`);
T('ย้ายไปห้องที่ไม่มีจริง → ปฏิเสธ', r.ok===false, r.error||'');

console.log('\n── AI. กดยืนยันสลิปกับรายการที่คีย์มือ ──');
let manual = await add('R7','2027-02-20','2027-02-21','คีย์มือไม่มีสลิป');
r = await J(`${OWNER}&action=slipok&id=${manual.id}`);
T('ยืนยันสลิปที่ไม่มีอยู่ → บอกเหตุผลตรงจุด', r.ok===false && /ไม่มีสลิป/.test(r.error), r.error);
row = raw.prepare('SELECT status FROM bookings WHERE id=?').get(String(manual.id));
T('รายการไม่เสียหาย', row.status==='จอง');

console.log('\n── AJ. จัดการบัญชีแบบมือใหม่ ──');
r = await J(`${OWNER}&action=user_add&username=noi&password=1234`);
T('เพิ่มพนักงานได้', r.ok===true);
r = await J(`${OWNER}&action=user_add&username=noi&password=5678`);
T('เพิ่มชื่อซ้ำ → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=user_add&username=x&password=1234`);
T('ชื่อสั้นเกินไป → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=user_add&username=somsak&password=12`);
T('รหัสสั้นเกินไป → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=user_setpw&username=ไม่มีคนนี้&password=1234`);
T('เปลี่ยนรหัสคนที่ไม่มี → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=user_del&username=noi`);
T('ลบพนักงานได้', r.ok===true);
r = await J('user=noi&pass=1234&action=login');
T('ลบแล้วเข้าระบบไม่ได้ทันที', r.ok===false);

console.log('\n── AK. ข้อความยาวเกินและอักขระพิเศษ ──');
let long = await add('R8','2027-02-25','2027-02-26','ลูกค้า','0811111111','ก'.repeat(400));
T('บันทึกยาว 400 ตัว → ไม่ล้ม', long.ok===true);
r = await J(`${OWNER}&action=editnote&id=${long.id}&note=${E('ข'.repeat(400))}`);
T('แก้บันทึกยาว → ตัดให้อัตโนมัติ', r.ok===true);
row = raw.prepare('SELECT note FROM bookings WHERE id=?').get(String(long.id));
T('ความยาวถูกจำกัด', row.note.length<=300, `${row.note.length} ตัวอักษร`);
r = await J(`action=lookup&name=${E("' OR 1=1 --")}&last4=1111`);
T('พิมพ์คำสั่งฐานข้อมูลในช่องค้นหา → ไม่หลุดข้อมูล', r.ok===true && r.rows.length===0, `${r.rows?.length} ผล`);

console.log('\n── AL. หน้าตรวจระบบหลังกดมั่วทั้งหมด ──');
a = await J(`${OWNER}&action=audit`);
T('ไม่มีการจองซ้อนเกิดขึ้นเลย', a.checks.find(c=>c.title==='การจองซ้อนกัน').count===0);
T('ไม่มีวันที่ผิดรูป', a.checks.find(c=>c.title==='วันที่ไม่ถูกต้อง').count===0);
T('ไม่มีห้องที่ไม่มีในระบบ', a.checks.find(c=>c.title==='จองห้องที่ไม่มีในระบบ').count===0);
T('ไม่มีรายการจ่ายแล้วถูกยกเลิกค้าง', a.checks.find(c=>c.title==='จ่ายเงินแล้วแต่ถูกยกเลิก').count===0);
T('สรุปรวม: ไม่มีเรื่องร้ายแรง', a.critical===0, `ร้ายแรง ${a.critical} · ควรดู ${a.warn}`);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
