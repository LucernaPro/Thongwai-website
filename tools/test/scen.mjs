import worker from '../../worker.js';
import { makeEnv } from './d1.mjs';
const env = makeEnv(); const ctx = { waitUntil(){} };
const J = async (qs, opt) => {
  const r = await worker.fetch(new Request('https://x/api?' + qs, opt), env, ctx);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : { _type: ct, _len: (await r.arrayBuffer()).byteLength, status: r.status };
};
const jpg = () => { const b = new Uint8Array(9000); b[0]=0xFF; b[1]=0xD8; return b; };
const post = body => ({ method:'POST', body });
let pass = 0, fail = 0;
const T = (name, ok, extra='') => { ok ? pass++ : fail++; console.log((ok?'  ✓ ':'  ✗ ')+name.padEnd(56)+extra); };

console.log('\n── 1. ลูกค้าจองปกติจนจบ ──');
let q = await J('action=quote&room=R3&checkin=2026-11-05&checkout=2026-11-06&bf=0&beds=0');
T('ขอราคา เฮือนเจ้าสัว 1 คืนวันพฤหัส', q.ok && q.total===1800, `${q.total} บาท`);
let h = await J('action=hold&room=R3&checkin=2026-11-05&checkout=2026-11-06&name=สมชาย ใจดี&phone=0812345678&ch=LINE&chid=somchai&bf=0&beds=0');
T('ถือห้องสำเร็จ', h.ok===true, h.id||h.error);
const A = { id:h.id, tok:h.tok };
let st = await J(`action=holdstatus&id=${A.id}&tok=${A.tok}`);
T('สถานะ = กำลังรอชำระ', st.state==='hold', `เหลือ ${st.secondsLeft} วิ`);
let qr = await J(`action=payqr&id=${A.id}&tok=${A.tok}`);
T('QR พร้อมเพย์ออกมาเป็นรูป', qr._type && qr._type.includes('svg'), `${qr._len} bytes`);
let up = await J(`action=slip&id=${A.id}&tok=${A.tok}`, post(jpg()));
T('แนบสลิปสำเร็จ', up.ok===true, up.error||'');
st = await J(`action=holdstatus&id=${A.id}&tok=${A.tok}`);
T('สถานะเปลี่ยนเป็นรอตรวจสลิป', st.state==='slip');

console.log('\n── 2. คนที่สองแย่งห้องเดียวกัน ──');
let h2 = await J('action=hold&room=R3&checkin=2026-11-05&checkout=2026-11-06&name=สมหญิง&phone=0899999999&ch=LINE&chid=somying');
T('ถูกปฏิเสธ ไม่ให้จองทับ', h2.ok===false && h2.taken===true, h2.error);
T('เสนอห้องอื่นให้แทน', (h2.alternatives||[]).length>0, `${(h2.alternatives||[]).length} ห้อง`);
T('ห้องที่เสนอไม่ใช่ห้องที่เต็ม', !(h2.alternatives||[]).some(r=>r.id==='R3'));

console.log('\n── 3. จองต่อท้ายพอดี (คนออกวันเดียวกับคนเข้า) ──');
let h3 = await J('action=hold&room=R3&checkin=2026-11-06&checkout=2026-11-07&name=ต่อท้าย&phone=0811111111&ch=phone');
T('อนุญาตให้จองได้', h3.ok===true, h3.error||'');

console.log('\n── 4. ไม่กรอกช่องทางติดต่อ ──');
let h4 = await J('action=hold&room=R5&checkin=2026-11-05&checkout=2026-11-06&name=ไม่ใส่ไอดี&phone=0822222222&ch=LINE&chid=');
T('ถูกปฏิเสธ พร้อมบอกเหตุผล', h4.ok===false, h4.error);
let h5 = await J('action=hold&room=R5&checkin=2026-11-05&checkout=2026-11-06&name=โทรได้&phone=0822222222&ch=phone');
T('เลือก "โทรตามเบอร์" ผ่านได้', h5.ok===true, h5.error||'');

console.log('\n── 5. แนบไฟล์ที่ไม่ใช่รูป ──');
const pdf = new Uint8Array(9000); pdf[0]=0x25; pdf[1]=0x50; pdf[2]=0x44; pdf[3]=0x46;
let bad = await J(`action=slip&id=${h5.id}&tok=${h5.tok}`, post(pdf));
T('ถูกปฏิเสธ ไม่ให้แนบ PDF', bad.ok===false, bad.error);
let tiny = await J(`action=slip&id=${h5.id}&tok=${h5.tok}`, post(new Uint8Array(500)));
T('ถูกปฏิเสธ ไฟล์เล็กผิดปกติ', tiny.ok===false, tiny.error);

console.log(`\nผ่าน ${pass} / ${pass+fail}`);
