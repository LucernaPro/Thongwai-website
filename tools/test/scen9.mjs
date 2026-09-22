// รอบเก้า: รายสัปดาห์ — ตัวเลขต้องนับจากวันที่จอง และรวม 7 วันย้อนหลังถูกต้อง
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const J = async (qs)=> (await worker.fetch(new Request('https://x/api?'+qs),env,ctx)).json();
const OWNER='user=admin&pass=2569';
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(52)+x);};
await J('action=availability');
const today = new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
const ago = n => new Date(Date.parse(today+'T00:00:00Z')-n*864e5).toISOString().slice(0,10);
const ins = (id,created,ci,co,status='จอง',amount=null,pay=null) =>
  raw.prepare(`INSERT INTO bookings (id,room,checkin,checkout,name,phone,status,created,staff,amount,pay)
    VALUES (?, 'R1', ?, ?, 'x', '08', ?, ?, 'admin', ?, ?)`).run(id,ci,co,status,created+' 10:00',amount,pay);

// วันนี้ 2 รายการ, เมื่อวาน 1, 6 วันก่อน 1 (ยังอยู่ในหน้าต่าง 7 วัน), 7 วันก่อน 1 (หลุดหน้าต่าง)
ins('a1',today,'2026-12-01','2026-12-03');               // 2 คืน
ins('a2',today,'2026-12-05','2026-12-06',  'จอง',2520,null); // ผ่านเว็บ ยืนยันแล้ว 1 คืน
ins('b1',ago(1),'2026-12-10','2026-12-11');
ins('c1',ago(6),'2026-12-12','2026-12-13');
ins('d1',ago(7),'2026-12-14','2026-12-15');              // นอกหน้าต่าง
ins('x1',ago(2),'2026-12-20','2026-12-21','ยกเลิก',null,'ยกเลิกโดยพนักงาน');  // ยกเลิกจริง
ins('x2',ago(2),'2026-12-22','2026-12-23','ยกเลิก',null,'expired');           // ถือห้องหมดเวลา ไม่นับ
ins('old',ago(20),'2026-12-25','2026-12-26');            // สัปดาห์ก่อนๆ

const s = await J(`${OWNER}&action=stats`);
const W = s.weekly;
T('มีข้อมูลรายสัปดาห์ในผล', !!W && !!W.now);
T('7 วันล่าสุดนับได้ 4 รายการ (ไม่นับวันที่ 7 ก่อน)', W.now.n===4, `${W.now.n}`);
T('คืนที่ขายรวม 5 คืน', W.now.nights===5, `${W.now.nights}`);
T('นับเฉพาะยกเลิกจริง ไม่นับถือห้องหมดเวลา', W.now.cx===1, `${W.now.cx}`);
T('นับรายการผ่านเว็บแยกได้', W.now.web===1, `${W.now.web}`);
T('ยอดเงินรวมเฉพาะที่ระบบล็อกไว้', W.now.baht===2520, `${W.now.baht}`);
T('มีบล็อก 7 วันย้อนหลัง 12 ชุด', W.weeks.length===12, `${W.weeks.length}`);
T('สัปดาห์ก่อนหน้านับรายการ 7 วันก่อนถูก', W.weeks[1].n===1, `${W.weeks[1].n}`);
T('ส่วนต่างเทียบสัปดาห์ก่อนคำนวณถูก', W.weeks[0].dN===3, `${W.weeks[0].dN}`);
const lastDay = W.days[W.days.length-1];
T('กราฟรายวัน วันสุดท้ายคือวันนี้', lastDay.d===today);
T('วันนี้จองใหม่ 2 รายการ', lastDay.n===2, `${lastDay.n}`);
T('ยอดย้อนหลัง 7 วัน ณ วันนี้ตรงกับหน้าต่าง', lastDay.r7.n===4, `${lastDay.r7.n}`);
T('กราฟรายวันมี 28 วัน', W.days.length===28);
T('รายการที่ยกเลิกไม่ถูกนับเป็นการจอง', W.now.n===4 && !W.days.some(x=>x.n>2));

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
