// รอบสี่: ฐานข้อมูลใหม่เอี่ยม · งานฝั่งพนักงาน · การชนกัน · ความถูกต้องของหน้าตรวจระบบ
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs,opt)=>{ const r=await worker.fetch(new Request('https://x/api?'+qs,opt),env,ctx);
  const ct=r.headers.get('content-type')||'';
  return ct.includes('json')?r.json():{_type:ct,_status:r.status}; };
const jpg=()=>{const b=new Uint8Array(9000);b[0]=0xFF;b[1]=0xD8;return b;};
const post=b=>({method:'POST',body:b});
const AU='user=admin&pass=2569';
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(54)+x);};
const hold=(room,ci,co,name,phone,extra='')=>
  J(`action=hold&room=${room}&checkin=${ci}&checkout=${co}&name=${encodeURIComponent(name)}&phone=${phone}&ch=phone${extra}`);

console.log('\n── H. ฐานข้อมูลใหม่เอี่ยม (เคสที่เพิ่งแก้) ──');
let av = await J('action=availability&days=5');
T('เปิดระบบครั้งแรกผ่าน', av.ok===true, `${av.rooms?.length} ห้อง`);
let rooms = raw.prepare('SELECT id,price,price_bf,extra_max FROM rooms ORDER BY sort').all();
T('ทุกห้องมีราคาไม่รวมอาหารเช้า', rooms.every(r=>r.price>0));
T('ทุกห้องมีราคารวมอาหารเช้า', rooms.every(r=>r.price_bf>0), `${rooms.filter(r=>!r.price_bf).length} ห้องที่ขาด`);
T('ทุกห้องมีโควตาเตียงเสริม', rooms.every(r=>r.extra_max!==null));
T('เฮือนมหาเศรษฐี 2300/2800 เสริม 5', JSON.stringify([rooms[0].price,rooms[0].price_bf,rooms[0].extra_max])==='[2300,2800,5]');

console.log('\n── I. สองคนกดจองห้องเดียวกันพร้อมกัน ──');
const both = await Promise.all([
  hold('R1','2026-11-18','2026-11-19','คนที่หนึ่ง','0811111111'),
  hold('R1','2026-11-18','2026-11-19','คนที่สอง','0822222222'),
]);
T('ผ่านได้คนเดียวเท่านั้น', both.filter(x=>x.ok).length===1, `ผ่าน ${both.filter(x=>x.ok).length} จาก 2`);
let n = raw.prepare("SELECT COUNT(*) c FROM bookings WHERE room='R1' AND status='จอง'").get().c;
T('ในฐานข้อมูลมีแถวเดียว', n===1, `${n} แถว`);

console.log('\n── J. พนักงานคีย์มือ / ย้ายห้อง / ยกเลิก ──');
let m = await J(`${AU}&action=add&room=R2&checkin=2026-11-18&checkout=2026-11-19&name=${encodeURIComponent('ลูกค้าโทรมา')}&phone=0833333333&note=${encodeURIComponent('มัดจำ 1,600฿ · ไม่รวมอาหารเช้า')}`);
T('คีย์มือบันทึกได้', m.ok===true, m.id||m.error);
let mv = await J(`${AU}&action=move&id=${m.id}&room=R1&checkin=2026-11-18&checkout=2026-11-19`);
T('ย้ายไปห้องที่มีคนจองแล้ว → ปฏิเสธ', mv.ok===false, mv.error);
mv = await J(`${AU}&action=move&id=${m.id}&room=R7&checkin=2026-11-18&checkout=2026-11-19`);
T('ย้ายไปห้องว่าง → สำเร็จ', mv.ok===true, mv.error||'');
let ed = await J(`${AU}&action=editnote&id=${m.id}&note=${encodeURIComponent('มัดจำ 650,000 กีบ · รวมอาหารเช้า')}`);
T('แก้บันทึก/มัดจำย้อนหลังได้', ed.ok===true);
let note = raw.prepare('SELECT note FROM bookings WHERE id=?').get(String(m.id)).note;
T('บันทึกใหม่ถูกเก็บจริง', note.includes('650,000'), note);
let cx = await J(`${AU}&action=cancel&id=${m.id}`);
T('ยกเลิกได้', cx.ok===true);
let again = await hold('R7','2026-11-18','2026-11-19','คนถัดไป','0844444444');
T('ห้องที่ยกเลิกกลับมาจองได้ทันที', again.ok===true);

console.log('\n── K. พนักงานปฏิเสธสลิปปลอม ──');
let f = await hold('R8','2026-11-22','2026-11-23','สลิปปลอม','0855555555');
await J(`action=slip&id=${f.id}&tok=${f.tok}`, post(jpg()));
let rj = await J(`${AU}&action=slipno&id=${f.id}&reason=${encodeURIComponent('สลิปไม่ตรงยอด')}`);
T('ปฏิเสธสำเร็จ', rj.ok===true);
let st = await J(`action=holdstatus&id=${f.id}&tok=${f.tok}`);
T('หน้าลูกค้าขึ้นว่าถูกยกเลิก', st.state==='cancelled');
let re = await J(`action=slip&id=${f.id}&tok=${f.tok}`, post(jpg()));
T('แนบสลิปซ้ำหลังถูกปฏิเสธ → ไม่ให้กู้คืน', re.ok===false, (re.error||'').slice(0,34)+'…');
let free = await hold('R8','2026-11-22','2026-11-23','คนใหม่','0866666666');
T('ห้องว่างให้คนอื่นจองได้', free.ok===true);

console.log('\n── L. หน้าตรวจระบบจับของจริงได้ไหม ──');
raw.prepare(`INSERT INTO bookings (id,room,checkin,checkout,name,phone,status,created,staff)
  VALUES ('DUP1','R9','2026-12-01','2026-12-03','ซ้อนคนที่1','0871','จอง','x','x')`).run();
raw.prepare(`INSERT INTO bookings (id,room,checkin,checkout,name,phone,status,created,staff)
  VALUES ('DUP2','R9','2026-12-02','2026-12-04','ซ้อนคนที่2','0872','จอง','x','x')`).run();
raw.prepare(`INSERT INTO bookings (id,room,checkin,checkout,name,phone,status,created,staff,slip,pay)
  VALUES ('PAID','R9','2026-12-20','2026-12-21','จ่ายแล้วโดนยกเลิก','0873','ยกเลิก','x','x','k','expired')`).run();
raw.prepare(`INSERT INTO bookings (id,room,checkin,checkout,name,phone,status,created,staff)
  VALUES ('GHOST','RXX','2026-12-05','2026-12-06','ห้องผี','0874','จอง','x','x')`).run();
let a = await J(`${AU}&action=audit`);
const find = t => a.checks.find(c=>c.title===t);
T('จับการจองซ้อนได้', find('การจองซ้อนกัน').count===1, `${find('การจองซ้อนกัน').count} คู่`);
T('จับห้องที่ไม่มีในระบบได้', find('จองห้องที่ไม่มีในระบบ').count===1);
T('จับจ่ายเงินแล้วถูกยกเลิกได้', find('จ่ายเงินแล้วแต่ถูกยกเลิก').count===1);
T('สรุปว่าพบเรื่องร้ายแรง', a.critical>=3, `ร้ายแรง ${a.critical} เรื่อง`);
T('แสดงช่วงเทศกาลที่ตั้งไว้', find('ช่วงเทศกาลที่ตั้งราคาไว้').count===4);

console.log('\n── M. ค้นหาแบบที่ลูกค้าพิมพ์จริง ──');
let lk = await J(`action=lookup&name=${encodeURIComponent('  คนใหม่  ')}&last4=6666`);
T('เว้นวรรคหน้าหลัง → ยังเจอ', lk.ok && lk.rows.length===1);
lk = await J(`action=lookup&name=${encodeURIComponent('คนใหม่')}&last4=666`);
T('เลขท้ายไม่ครบ 4 ตัว → ปฏิเสธ', lk.ok===false, lk.error);

console.log('\n── N. ปล่อยห้องหลังแนบสลิปแล้ว ──');
let s2 = await hold('R5','2026-11-28','2026-11-29','แนบแล้ว','0888888888');
await J(`action=slip&id=${s2.id}&tok=${s2.tok}`, post(jpg()));
let rel = await J(`action=release&id=${s2.id}&tok=${s2.tok}`);
T('กดปิดแผงหลังแนบสลิป → ห้องไม่หลุด', rel.ok===false);
let row = raw.prepare("SELECT status,pay FROM bookings WHERE id=?").get(String(s2.id));
T('ยังเป็นจอง รอตรวจสลิปอยู่', row.status==='จอง' && row.pay==='slip');

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
