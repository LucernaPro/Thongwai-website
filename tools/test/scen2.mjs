import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs,opt)=>{ const r=await worker.fetch(new Request('https://x/api?'+qs,opt),env,ctx);
  const ct=r.headers.get('content-type')||''; return ct.includes('json')?r.json():{_type:ct,status:r.status}; };
const jpg=()=>{const b=new Uint8Array(9000);b[0]=0xFF;b[1]=0xD8;return b;};
const post=b=>({method:'POST',body:b});
const AU='user=admin&pass=2569';
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(58)+x);};
await J('action=availability');   // ให้ init สร้างผู้ใช้ admin

console.log('\n── 6. เวลาหมดระหว่างลูกค้าไปโอนเงิน (บั๊กที่เพิ่งแก้) ──');
let h = await J('action=hold&room=R7&checkin=2026-11-10&checkout=2026-11-11&name=ไปธนาคาร&phone=0812223333&ch=LINE&chid=bank');
raw.prepare("UPDATE bookings SET expires=1 WHERE id=?").run(h.id);        // จำลองหมดเวลา
raw.prepare("UPDATE bookings SET status='ยกเลิก',pay='expired' WHERE pay='hold' AND expires IS NOT NULL AND expires<?").run(Date.now());
let row = raw.prepare("SELECT status,pay FROM bookings WHERE id=?").get(h.id);
T('หมดเวลาแล้วถูกยกเลิกถูกต้อง', row.status==='ยกเลิก', `${row.status}/${row.pay}`);
let up = await J(`action=slip&id=${h.id}&tok=${h.tok}`, post(jpg()));
T('กลับมาแนบสลิป → ได้ห้องคืน', up.ok===true && up.revived===true, up.error||'กู้คืนแล้ว');
row = raw.prepare("SELECT status,pay,slip FROM bookings WHERE id=?").get(h.id);
T('สถานะกลับเป็นจอง + มีสลิป', row.status==='จอง' && row.pay==='slip' && !!row.slip);

console.log('\n── 7. หมดเวลา แล้วคนอื่นเอาห้องไปแล้วจริงๆ ──');
let g = await J('action=hold&room=R8&checkin=2026-11-12&checkout=2026-11-13&name=ช้าไป&phone=0813334444&ch=LINE&chid=late');
raw.prepare("UPDATE bookings SET expires=1 WHERE id=?").run(g.id);
raw.prepare("UPDATE bookings SET status='ยกเลิก',pay='expired' WHERE pay='hold' AND expires IS NOT NULL AND expires<?").run(Date.now());
let other = await J('action=hold&room=R8&checkin=2026-11-12&checkout=2026-11-13&name=คนที่ได้ห้อง&phone=0814445555&ch=phone');
T('คนใหม่จองห้องที่หลุดได้', other.ok===true);
let up2 = await J(`action=slip&id=${g.id}&tok=${g.tok}`, post(jpg()));
T('คนเก่าแนบสลิป → กู้ไม่ได้ แจ้งให้ติดต่อที่พัก', up2.ok===false && /ติดต่อที่พัก/.test(up2.error||''), (up2.error||'').slice(0,42)+'…');
row = raw.prepare("SELECT status FROM bookings WHERE id=?").get(String(other.id));
T('ห้องยังเป็นของคนใหม่ ไม่โดนแย่งกลับ', row.status==='จอง');

console.log('\n── 8. ต่อเวลาเงียบๆ เมื่อไม่มีใครรอ ──');
let k = await J('action=hold&room=R9&checkin=2026-11-14&checkout=2026-11-15&name=ยังอยู่หน้าจอ&phone=0815556666&ch=phone');
raw.prepare("UPDATE bookings SET expires=? WHERE id=?").run(Date.now()+20000, k.id);  // เหลือ 20 วิ
let s1 = await J(`action=holdstatus&id=${k.id}&tok=${k.tok}`);
T('ใกล้หมดเวลา → ต่อให้อัตโนมัติ', s1.secondsLeft>200, `เหลือ ${s1.secondsLeft} วิ`);

console.log('\n── 9. พนักงานตรวจสลิปแล้วยืนยัน ──');
let pend = await J(`${AU}&action=pending`);
T('สลิปโผล่ในหน้าตรวจ', pend.ok && pend.waiting>0, `${pend.waiting} ใบรอตรวจ`);
let ok = await J(`${AU}&action=slipok&id=${h.id}`);
T('กดยืนยันสำเร็จ', ok.ok===true, ok.error||'');
let st = await J(`action=holdstatus&id=${h.id}&tok=${h.tok}`);
T('หน้าลูกค้าเปลี่ยนเป็นยืนยันแล้ว', st.state==='confirmed');

console.log('\n── 10. ค้นหาการจองด้วยชื่อ + เลขท้ายเบอร์ ──');
let f1 = await J('action=lookup&name=ไปธนาคาร&last4=3333');
T('ชื่อ+เลขท้ายถูก → เจอ', f1.ok && f1.rows.length===1, f1.rows?.[0]?.roomName||'');
let f2 = await J('action=lookup&name=ไปธนาคาร&last4=9999');
T('เลขท้ายผิด → ไม่เจอ', f2.ok && f2.rows.length===0);
T('ผลค้นหาไม่คืนกุญแจการจอง', !JSON.stringify(f1).includes('tok'));

console.log('\n── 11. หน้าตรวจสุขภาพระบบ ──');
let a = await J(`${AU}&action=audit`);
T('ตรวจผ่าน ไม่พบเรื่องร้ายแรง', a.ok && a.critical===0, `ร้ายแรง ${a.critical} · ควรดู ${a.warn}`);
const dbl = a.checks.find(c=>c.title==='การจองซ้อนกัน');
T('ไม่มีห้องถูกจองซ้อน', dbl && dbl.count===0);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
