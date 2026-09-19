// รอบแปด: มุมเจ้าของ — ไฟล์สำรองต้องกู้ได้จริง ตัวเลขต้องเชื่อได้
import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx={waitUntil(){}};
const R = (qs,opt)=> worker.fetch(new Request('https://x/api?'+qs,opt),env,ctx);
const J = async (qs,opt)=>{ const r=await R(qs,opt); const ct=r.headers.get('content-type')||'';
  return ct.includes('json')?r.json():{_type:ct,_status:r.status}; };
const jpg=()=>{const b=new Uint8Array(9000);b[0]=0xFF;b[1]=0xD8;return b;};
const post=b=>({method:'POST',body:b});
const OWNER='user=admin&pass=2569';
const raw=env.DB._raw;
let pass=0,fail=0; const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'  ✓ ':'  ✗ ')+n.padEnd(52)+x);};
const E=s=>encodeURIComponent(s);
await J('action=availability');

console.log('\n── AM. สร้างข้อมูลจริงหลายแบบไว้ทดสอบ ──');
// จองผ่านเว็บ ยืนยันแล้ว (ยอดอยู่ใน amount)
const web = await J(`action=hold&room=R1&checkin=2026-12-31&checkout=2027-01-01&name=${E('ลูกค้าเว็บ')}&phone=0811111111&ch=LINE&chid=web1&bf=1&beds=2`);
await J(`action=slip&id=${web.id}&tok=${web.tok}`, post(jpg()));
await J(`${OWNER}&action=slipok&id=${web.id}`);
// จองผ่านเว็บ รอตรวจสลิป
const pend = await J(`action=hold&room=R2&checkin=2027-01-10&checkout=2027-01-11&name=${E('รอตรวจ')}&phone=0822222222&ch=phone`);
await J(`action=slip&id=${pend.id}&tok=${pend.tok}`, post(jpg()));
// คีย์มือ (ยอดอยู่ในหมายเหตุ)
const man = await J(`${OWNER}&action=add&room=R3&checkin=2027-01-12&checkout=2027-01-13&name=${E('คีย์มือ')}&phone=0833333333&note=${E('มัดจำ 1,800฿ · ไม่รวมอาหารเช้า')}`);
// ยกเลิกไปแล้ว
const cx = await J(`${OWNER}&action=add&room=R4&checkin=2027-01-14&checkout=2027-01-15&name=${E('ยกเลิกแล้ว')}&phone=0844444444`);
await J(`${OWNER}&action=cancel&id=${cx.id}`);
T('เตรียมข้อมูล 4 แบบเรียบร้อย', [web,pend,man,cx].every(x=>x.ok), '');

console.log('\n── AN. ไฟล์สำรอง (CSV) ต้องกู้ระบบได้จริง ──');
let res = await R(`${OWNER}&action=export`);
const bytes = new Uint8Array(await res.clone().arrayBuffer());
const csv = await res.text();
T('ดาวน์โหลดได้ เป็นไฟล์ CSV', (res.headers.get('content-type')||'').includes('csv'));
T('มี BOM ให้ Excel อ่านภาษาไทยออก', bytes[0]===0xEF && bytes[1]===0xBB && bytes[2]===0xBF);
const head = csv.split('\n')[0];
for (const col of ['ยอดเงิน','สถานะการจ่าย','ช่องทางติดต่อ','อาหารเช้า','เตียงเสริม','มีสลิป'])
  T(`มีคอลัมน์ ${col}`, head.includes(col));
const lines = csv.split('\n');
const webLine = lines.find(l=>l.includes('ลูกค้าเว็บ'));
const wantAmt = Math.round(2800*1.4)+600;
T('ยอดเงินของลูกค้าเว็บอยู่ในไฟล์สำรอง', webLine.includes(String(wantAmt)), `${wantAmt} บาท`);
T('ช่องทางติดต่อถูกสำรองด้วย', webLine.includes('web1'));
T('บอกว่าอาหารเช้ารวมและเสริมกี่เตียง', webLine.includes('"รวม"') && webLine.includes('"2"'));
T('รายการที่ยืนยันแล้วระบุว่ายืนยันแล้ว', webLine.includes('ยืนยันแล้ว'));
const pendLine = lines.find(l=>l.includes('รอตรวจ'));
T('รายการรอตรวจสลิประบุสถานะถูก', pendLine.includes('รอตรวจสลิป') && pendLine.includes('"มี"'));
const cxLine = lines.find(l=>l.includes('ยกเลิกแล้ว'));
T('รายการที่ยกเลิกยังอยู่ในไฟล์ ไม่หายไป', !!cxLine && cxLine.includes('ยกเลิก'));
const manLine = lines.find(l=>l.includes('คีย์มือ'));
T('ยอดมัดจำของรายการคีย์มืออยู่ในหมายเหตุ', manLine.includes('1,800'));
const cols = l => { let n=1,q=false; for(const c of l){ if(c==='"') q=!q; else if(c===','&&!q) n++; } return n; };
const want = cols(head);
T('ทุกแถวมีจำนวนคอลัมน์เท่ากัน',
  lines.filter(l=>l.trim()).every(l=>cols(l)===want), `${want} คอลัมน์`);

console.log('\n── AO. หน้าวิเคราะห์ ──');
let s = await J(`${OWNER}&action=stats`);
T('เจ้าของเปิดได้', s.ok===true, s.error||'');
T('บอกจำนวนห้องทั้งหมดถูก', s.summary.units===17, `${s.summary.units} ห้อง`);
T('ไม่นับรายการที่ยกเลิกเป็นการจอง',
  JSON.stringify(s).includes('ยกเลิกแล้ว')===false, 'ไม่มีชื่อรายการที่ยกเลิกในผล');
T('มีวันที่อ้างอิงเป็นวันนี้', s.summary.today===new Date(Date.now()+7*3600e3).toISOString().slice(0,10), s.summary.today);

console.log('\n── AP. เงินที่ระบบรายงาน เทียบกับเงินจริง ──');
const paid = raw.prepare("SELECT SUM(amount) t FROM bookings WHERE status='จอง' AND amount IS NOT NULL AND pay IS NULL").get().t;
T('ยอดที่ยืนยันแล้วรวมได้ถูกต้อง', paid===wantAmt, `${paid} บาท`);
const waiting = raw.prepare("SELECT SUM(amount) t FROM bookings WHERE pay='slip'").get().t;
T('ยอดที่ยังรอตรวจแยกออกจากยอดที่ยืนยันแล้ว', waiting>0 && waiting!==paid, `รอตรวจ ${waiting} บาท`);

console.log('\n── AQ. หน้าตรวจระบบในมุมเจ้าของ ──');
let a = await J(`${OWNER}&action=audit`);
T('บอกรายการที่ยังไม่ยืนยันใกล้เข้าพัก', !!a.checks.find(c=>c.title==='ใกล้เข้าพักแต่ยังไม่ยืนยัน'));
T('บอกสลิปที่ค้างข้ามวัน', !!a.checks.find(c=>c.title==='สลิปค้างข้ามวัน'));
T('บอกช่วงเทศกาลที่ตั้งราคาไว้', a.checks.find(c=>c.title==='ช่วงเทศกาลที่ตั้งราคาไว้').count===4);
T('ไม่มีเรื่องร้ายแรงค้าง', a.critical===0, `ร้ายแรง ${a.critical}`);

console.log('\n── AR. ข้อมูลลูกค้าไม่รั่วออกทางสาธารณะ ──');
let pub = await J('action=availability&days=30');
const txt = JSON.stringify(pub);
T('ปฏิทินสาธารณะไม่มีชื่อลูกค้า', !txt.includes('ลูกค้าเว็บ') && !txt.includes('คีย์มือ'));
T('ปฏิทินสาธารณะไม่มีเบอร์โทร', !txt.includes('0811111111'));
T('ปฏิทินสาธารณะไม่มียอดเงิน', !txt.includes(String(wantAmt)));
let ex = await J('action=export');
T('ไม่ล็อกอิน โหลดไฟล์สำรองไม่ได้', ex.ok===false, ex.error);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
