// รอบห้า: ความถูกต้องของเงิน — ตัวเลขที่ลูกค้าจ่ายจริงต้องไม่มีทางเพี้ยน
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs)=> (await worker.fetch(new Request('https://x/api?'+qs), env, ctx)).json();
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(52)+x);};
const q=(room,ci,co,bf=0,beds=0)=>J(`action=quote&room=${room}&checkin=${ci}&checkout=${co}&bf=${bf}&beds=${beds}`);
await J('action=availability');
const D=['อา','จ','อ','พ','พฤ','ศ','ส'];
const dow=d=>D[new Date(d+'T00:00:00Z').getUTCDay()];

console.log('\n── O. เรตวันธรรมดา/ศุกร์-เสาร์ ครบทุกวันในสัปดาห์ ──');
const base=1800, exp={'จ':1800,'อ':1800,'พ':1800,'พฤ':1800,'ศ':2160,'ส':2160,'อา':1800};
let allOk=true, detail=[];
for (let i=0;i<7;i++){
  const d=new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10);
  const co=new Date(Date.UTC(2026,10,3+i)).toISOString().slice(0,10);
  const r=await q('R3',d,co);
  const want=exp[dow(d)];
  if(r.total!==want){allOk=false;detail.push(`${dow(d)} ได้ ${r.total} ควร ${want}`);}
}
T('ราคาตรงทุกวันในสัปดาห์', allOk, detail.join(' · '));

console.log('\n── P. เทศกาลทั้ง 4 ช่วง ──');
const seasons=[['2026-10-22',1.30,'ปิยมหาราช'],['2026-10-24',1.30,'ปิยมหาราช คืนสุดท้าย'],
               ['2026-10-25',1.00,'พ้นช่วงแล้ว'],['2026-12-04',1.30,'วันพ่อ'],
               ['2026-12-29',1.40,'ปีใหม่วันแรก'],['2027-01-02',1.40,'ปีใหม่วันสุดท้าย'],
               ['2027-01-03',1.00,'พ้นปีใหม่'],['2027-04-11',1.40,'สงกรานต์วันแรก'],
               ['2027-04-16',1.40,'สงกรานต์วันสุดท้าย'],['2027-04-17',1.00,'พ้นสงกรานต์']];
for (const [d,mult,label] of seasons){
  const co=new Date(new Date(d+'T00:00:00Z').getTime()+864e5).toISOString().slice(0,10);
  const r=await q('R3',d,co);
  const wk=[5,6].includes(new Date(d+'T00:00:00Z').getUTCDay());
  const want=Math.round(base*Math.max(mult, wk?1.2:1));
  T(`${d} (${dow(d)}) ${label}`, r.total===want, `${r.total} บาท`);
}

console.log('\n── Q. เตียงเสริมกับอาหารเช้า ──');
let r=await q('R1','2026-11-04','2026-11-05',0,3);
T('ไม่รวมอาหาร + เสริม 3 = 2300 + 600', r.total===2300+600, `${r.total}`);
r=await q('R1','2026-11-04','2026-11-05',1,3);
T('รวมอาหาร + เสริม 3 = 2800 + 900', r.total===2800+900, `${r.total}`);
r=await q('R1','2026-11-06','2026-11-07',1,3);
T('คืนศุกร์: ห้องขึ้น 20% แต่เตียงไม่ขึ้น', r.total===Math.round(2800*1.2)+900, `${r.total}`);
r=await q('R1','2026-12-31','2027-01-01',1,5);
T('คืนปีใหม่ + เสริมเต็ม 5 ที่', r.total===Math.round(2800*1.4)+1500, `${r.total}`);

console.log('\n── R. ยอดที่โชว์ต้องบวกกันลงตัว (กันลูกค้าจับได้) ──');
let bad=[];
for (const [room,ci,co,bf,beds] of [['R1','2026-11-04','2026-11-05',0,0],['R1','2026-12-31','2027-01-01',1,5],
     ['R3','2026-11-06','2026-11-09',1,2],['T1','2027-04-11','2027-04-13',1,0]]){
  const x=await q(room,ci,co,bf,beds);
  if (x.roomTotal+x.bedTotal !== x.total) bad.push(`${room} ${ci}`);
}
T('ค่าห้อง + เตียงเสริม = ยอดรวม ทุกกรณี', bad.length===0, bad.join(' · '));
r=await q('R1','2026-12-31','2027-01-01',0,0);
T('ไม่มีบรรทัดไหนเผยราคาฐาน', r.roomTotal===Math.round(2300*1.4) && r.roomTotal!==2300, `ค่าห้อง ${r.roomTotal}`);

console.log('\n── S. ยอดที่บันทึกตอนจอง ต้องตรงกับที่เสนอ ──');
const h=await J(`action=hold&room=R1&checkin=2026-12-31&checkout=2027-01-01&name=${encodeURIComponent('ปีใหม่')}&phone=0812345678&ch=phone&bf=1&beds=2`);
const want=Math.round(2800*1.4)+600;
T('ยอดที่ถือห้องตรงกับที่คำนวณ', h.deposit===want, `${h.deposit} ควร ${want}`);
const saved=raw.prepare('SELECT amount,bf,beds FROM bookings WHERE id=?').get(String(h.id));
T('ยอดถูกล็อกลงฐานข้อมูล', saved.amount===want, `${saved.amount}`);
T('ตัวเลือกอาหารเช้า/เตียงถูกเก็บด้วย', saved.bf===1 && saved.beds===2, `bf=${saved.bf} beds=${saved.beds}`);

console.log('\n── T. ขึ้นราคาแล้วยอดเก่าต้องไม่ขยับ ──');
raw.prepare("UPDATE rooms SET price=9999, price_bf=9999 WHERE id='R1'").run();
const st=await J(`action=holdstatus&id=${h.id}&tok=${h.tok}`);
T('ยอดของรายการที่จองไปแล้วคงเดิม', st.amount===want, `${st.amount}`);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
