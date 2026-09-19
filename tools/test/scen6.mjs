// รอบหก: ฝั่งพนักงาน — สิทธิ์ การล็อกตัวเอง และการกดพลาดที่เกิดขึ้นจริงหน้างาน
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
await J('action=availability');

console.log('\n── U. เข้าสู่ระบบ ──');
let r = await J('user=admin&pass=ผิด&action=login');
T('รหัสผิด → เข้าไม่ได้', r.ok===false, r.error);
r = await J('user=ไม่มีคนนี้&pass=2569&action=login');
T('ชื่อผู้ใช้ไม่มีจริง → เข้าไม่ได้', r.ok===false);
r = await J(`${OWNER}&action=login`);
T('เจ้าของเข้าได้ และบอกสิทธิ์', r.ok===true && r.role==='admin', `role=${r.role}`);

console.log('\n── V. สิทธิ์พนักงานธรรมดา ──');
r = await J(`${OWNER}&action=user_add&username=deng&password=1234`);
T('เจ้าของเพิ่มพนักงานได้', r.ok===true, r.error||'');
const STAFF='user=deng&pass=1234';
r = await J(`${STAFF}&action=login`);
T('พนักงานเข้าระบบได้', r.ok===true && r.role==='staff');
r = await J(`${STAFF}&action=add&room=R1&checkin=2026-11-18&checkout=2026-11-19&name=${E('ลูกค้า')}&phone=0811111111`);
T('พนักงานรับจองได้', r.ok===true);
const bid = r.id;
r = await J(`${STAFF}&action=stats`);
T('พนักงานดูหน้าวิเคราะห์ไม่ได้', r.ok===false, r.error);
r = await J(`${STAFF}&action=export`);
T('พนักงานดาวน์โหลดข้อมูลทั้งหมดไม่ได้', r.ok===false, r.error);
r = await J(`${STAFF}&action=user_add&username=hack&password=1234`);
T('พนักงานตั้งบัญชีเจ้าของเองไม่ได้', r.ok===false, r.error);
r = await J(`${STAFF}&action=user_del&username=admin`);
T('พนักงานลบบัญชีเจ้าของไม่ได้', r.ok===false, r.error);
r = await J(`${STAFF}&action=audit`);
T('พนักงานเปิดหน้าตรวจระบบได้ (ตั้งใจให้เปิดได้)', r.ok===true);

console.log('\n── W. กันล็อกตัวเองออกจากระบบ ──');
r = await J(`${OWNER}&action=user_del&username=admin`);
T('ลบบัญชีเจ้าของไม่ได้', r.ok===false, r.error);
let cnt = raw.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
T('ยังมีบัญชีเจ้าของเหลืออยู่', cnt>=1, `${cnt} บัญชี`);

console.log('\n── X. กดพลาดหน้างาน ──');
let h = await J(`action=hold&room=R2&checkin=2026-11-25&checkout=2026-11-26&name=${E('ลูกค้าเว็บ')}&phone=0899999999&ch=phone`);
await J(`action=slip&id=${h.id}&tok=${h.tok}`, post(jpg()));
let ok1 = await J(`${OWNER}&action=slipok&id=${h.id}`);
let ok2 = await J(`${OWNER}&action=slipok&id=${h.id}`);
T('กดยืนยันรัวสองครั้ง → ครั้งที่สองไม่ซ้ำ', ok1.ok===true && ok2.ok===false, ok2.error);
let no = await J(`${OWNER}&action=slipno&id=${h.id}&reason=${E('กดพลาด')}`);
T('กดปฏิเสธหลังยืนยันไปแล้ว → ไม่ให้', no.ok===false, no.error||'');
let row = raw.prepare('SELECT status,pay FROM bookings WHERE id=?').get(String(h.id));
T('รายการยังเป็นจองที่ยืนยันแล้ว', row.status==='จอง' && row.pay===null, `${row.status}/${row.pay}`);

r = await J(`${OWNER}&action=cancel&id=${bid}`);
let r2 = await J(`${OWNER}&action=cancel&id=${bid}`);
T('กดยกเลิกซ้ำ → บอกว่ายกเลิกไปแล้ว', r.ok===true && r2.ok===false, r2.error||'');
r = await J(`${OWNER}&action=editnote&id=${bid}&note=${E('แก้หลังยกเลิก')}`);
T('แก้บันทึกรายการที่ยกเลิกแล้ว → ไม่ให้', r.ok===false, r.error);
r = await J(`${OWNER}&action=move&id=${bid}&room=R3&checkin=2026-11-18&checkout=2026-11-19`);
T('ย้ายห้องรายการที่ยกเลิกแล้ว → ไม่ให้', r.ok===false, r.error||'');

console.log('\n── Y. คีย์มือแบบกรอกไม่ครบ/ผิด ──');
r = await J(`${OWNER}&action=add&room=R3&checkin=2026-11-30&checkout=2026-11-29&name=${E('วันกลับหัว')}&phone=081`);
T('เช็คเอาท์ก่อนเช็คอิน → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=add&room=RXX&checkin=2026-11-30&checkout=2026-12-01&name=${E('ห้องผี')}&phone=081`);
T('ห้องที่ไม่มีจริง → ปฏิเสธ', r.ok===false, r.error);
r = await J(`${OWNER}&action=add&room=R3&checkin=2026-11-30&checkout=2026-12-01&name=&phone=081`);
T('ไม่ใส่ชื่อ → ปฏิเสธ', r.ok===false, r.error);

console.log('\n── Z. พนักงานสองคนทำพร้อมกัน ──');
let g = await J(`action=hold&room=R4&checkin=2026-12-10&checkout=2026-12-11&name=${E('รอตรวจ')}&phone=0866666666&ch=phone`);
await J(`action=slip&id=${g.id}&tok=${g.tok}`, post(jpg()));
const race = await Promise.all([ J(`${OWNER}&action=slipok&id=${g.id}`), J(`${STAFF}&action=slipno&id=${g.id}&reason=x`) ]);
T('ยืนยันกับปฏิเสธพร้อมกัน → สำเร็จแค่ทางเดียว', race.filter(x=>x.ok).length===1, `สำเร็จ ${race.filter(x=>x.ok).length}`);
const two = await Promise.all([
  J(`${OWNER}&action=add&room=R6&checkin=2026-12-15&checkout=2026-12-16&name=${E('พนักงาน ก')}&phone=0811`),
  J(`${STAFF}&action=add&room=R6&checkin=2026-12-15&checkout=2026-12-16&name=${E('พนักงาน ข')}&phone=0822`),
]);
T('พนักงานสองคนคีย์ห้องเดียวกัน → ผ่านคนเดียว', two.filter(x=>x.ok).length===1);

console.log('\n── AC. พนักงานตั้งใจยกเลิกรายการที่จ่ายแล้ว ──');
let pd = await J(`action=hold&room=R7&checkin=2026-12-18&checkout=2026-12-19&name=${E('ขอยกเลิกเอง')}&phone=0877777777&ch=phone`);
await J(`action=slip&id=${pd.id}&tok=${pd.tok}`, post(jpg()));
await J(`${OWNER}&action=slipok&id=${pd.id}`);
r = await J(`${OWNER}&action=cancel&id=${pd.id}`);
T('ยกเลิกรายการที่ยืนยันแล้วได้', r.ok===true);
let au = await J(`${OWNER}&action=audit`);
const pc = au.checks.find(c=>c.title==='จ่ายเงินแล้วแต่ถูกยกเลิก');
T('ไม่ขึ้นเตือนค้าง เพราะมีคนตัดสินใจแล้ว', pc.count===0, `${pc.count} รายการ`);
let freed = await J(`action=hold&room=R7&checkin=2026-12-18&checkout=2026-12-19&name=${E('คนใหม่')}&phone=0888888888&ch=phone`);
T('ห้องกลับมาว่างให้จองได้', freed.ok===true);

console.log('\n── AA. บันทึกการกระทำ (audit) ──');
const acts = raw.prepare("SELECT action, actor FROM audit ORDER BY seq DESC LIMIT 12").all();
T('มีการบันทึก audit', acts.length>0, `${acts.length} รายการล่าสุด`);
T('บันทึกว่าใครยืนยันสลิป', acts.some(a=>/ยืนยันสลิป/.test(a.action)));
T('บันทึกว่าใครแก้บันทึก', acts.some(a=>/แก้บันทึก/.test(a.action)));
T('บันทึกชื่อผู้ทำไว้ด้วย', acts.every(a=>!!a.actor));

console.log('\n── AB. เปลี่ยนรหัสผ่าน ──');
r = await J(`${OWNER}&action=user_setpw&username=deng&password=9999`);
T('เจ้าของเปลี่ยนรหัสพนักงานได้', r.ok===true, r.error||'');
r = await J(`user=deng&pass=1234&action=login`);
T('รหัสเก่าใช้ไม่ได้แล้ว', r.ok===false);
r = await J(`user=deng&pass=9999&action=login`);
T('รหัสใหม่ใช้ได้', r.ok===true);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
