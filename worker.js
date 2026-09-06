/**
 * ═══════════════════════════════════════════════════════════════
 * Thongwai Homestay — Booking API (Cloudflare Worker + D1)
 * แทนที่แผน Google Sheets/Apps Script — ทุกอย่างอยู่ในบัญชี Cloudflare เดียว
 * Endpoint: /api?action=...   (contract เดิมที่ /admin และหน้าแรกเรียกอยู่แล้ว)
 * ไฟล์นี้ถูกกันไม่ให้เสิร์ฟเป็นไฟล์สาธารณะด้วย .assetsignore (มี PIN ข้างใน)
 * ═══════════════════════════════════════════════════════════════
 */

// ระบบผู้ใช้: user+password รายคน เก็บใน D1 (ตาราง users) — คนแรก admin/2569 seed อัตโนมัติ
// จัดการผู้ใช้ (เพิ่ม/ลบ/เปลี่ยนรหัส) ทำได้เฉพาะ role=admin ผ่านหน้า /admin

// ═══ นำเข้าสมุดจองเดิม (ชั่วคราว — ลบทิ้งหลังนำเข้าเสร็จ) ═══
import IMPORT_DATA from './tools/import-data.json' with { type: 'json' };
import qrcode from './tools/qrcode.js';

function addDaysStr(s, n) {
  const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hashPw(password, salt) {
  const data = new TextEncoder().encode(salt + ':' + password);
  return hex(await crypto.subtle.digest('SHA-256', data));
}
async function makePw(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(12)));
  return salt + '$' + await hashPw(password, salt);
}
async function checkPw(password, stored) {
  const [salt, h] = String(stored).split('$');
  if (!salt || !h) return false;
  return (await hashPw(password, salt)) === h;
}

const SEED_ROOMS = [
  ['R1', 'เฮือนมหาเศรษฐี',      6,  2300, 1],
  ['R2', 'เฮือนโชคลาภเงินทอง',  4,  1600, 2],
  ['R3', 'เฮือนเจ้าสัว 1',       4,  1800, 3],
  ['R4', 'เฮือนเจ้าสัว 2',       4,  1800, 4],
  ['R5', 'เฮือนมั่งมีเงินทอง',   2,   800, 5],
  ['R6', 'เฮือนล้ำลวย',          2,   800, 6],
  ['R7', 'เฮือนอุดมสุข',         4,  1600, 7],
  ['R8', 'เฮือนมั่งคั่ง',       10,  3000, 8],
  ['R9', 'เฮือนมหาเฮง',         10,  3000, 9],
  ['T1', 'เต็นท์ 1',              2,   600, 10],
  ['T2', 'เต็นท์ 2',              2,   600, 11],
  ['T3', 'เต็นท์ 3',              2,   600, 12],
  ['T4', 'เต็นท์ 4',              2,   600, 13],
  ['T5', 'เต็นท์ 5',              2,   600, 14],
  ['T6', 'เต็นท์ 6',              2,   600, 15],
  ['T7', 'เต็นท์ 7',              2,   600, 16],
  ['T8', 'เต็นท์ 8',              2,   600, 17],
];

/* ── เวลา สปป.ลาว (UTC+7 ไม่มี DST) ── */
const todayStr = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const nowStamp = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

const json = obj => new Response(JSON.stringify(obj), {
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  },
});

/* ── สร้างตาราง + seed ห้อง ครั้งแรกอัตโนมัติ (ไม่ต้องมีขั้นตอนติดตั้ง SQL) ── */
let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, capacity INTEGER, price INTEGER, sort INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, room TEXT NOT NULL, checkin TEXT NOT NULL, checkout TEXT NOT NULL,
      name TEXT NOT NULL, phone TEXT, note TEXT, status TEXT NOT NULL,
      created TEXT, staff TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS ix_book ON bookings (room, status, checkin, checkout)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY, pass TEXT NOT NULL, role TEXT NOT NULL, created TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT, ref TEXT, data TEXT)`),
  ]);
  // migration ก.ย. 2026: จองออนไลน์ + มัดจำ
  // เจตนา: ไม่แตะ status เดิม ('จอง'/'ยกเลิก') เลย — การถือห้องก็ status='จอง' เหมือนกัน
  // ทำให้ทุก query กันจองซ้อนที่มีอยู่แล้วครอบคลุมการถือห้องอัตโนมัติ ไม่ต้องแก้ที่ไหน
  // สถานะการจ่ายเงินแยกไว้คอลัมน์ pay: 'hold' → 'slip' → NULL (พนักงานยืนยันแล้ว)
  {
    const cols = (await db.prepare('PRAGMA table_info(bookings)').all()).results.map(r => r.name);
    const add = [];
    if (!cols.includes('pay'))     add.push('ALTER TABLE bookings ADD COLUMN pay TEXT');
    if (!cols.includes('expires')) add.push('ALTER TABLE bookings ADD COLUMN expires INTEGER');
    if (!cols.includes('tok'))     add.push('ALTER TABLE bookings ADD COLUMN tok TEXT');
    if (!cols.includes('amount'))  add.push('ALTER TABLE bookings ADD COLUMN amount INTEGER');
    if (!cols.includes('slip'))    add.push('ALTER TABLE bookings ADD COLUMN slip TEXT');
    if (!cols.includes('contact')) add.push('ALTER TABLE bookings ADD COLUMN contact TEXT');
    if (!cols.includes('bf'))      add.push('ALTER TABLE bookings ADD COLUMN bf INTEGER');
    if (!cols.includes('beds'))    add.push('ALTER TABLE bookings ADD COLUMN beds INTEGER');
    if (add.length) await db.batch(add.map(q => db.prepare(q)));
  }

  // migration 6 ก.ย. 2026: ราคารวม/ไม่รวมอาหารเช้า + เตียงเสริม (รันครั้งเดียว)
  {
    const rc = (await db.prepare('PRAGMA table_info(rooms)').all()).results.map(r => r.name);
    if (!rc.includes('price_bf')) {
      await db.batch([
        db.prepare('ALTER TABLE rooms ADD COLUMN price_bf INTEGER'),
        db.prepare('ALTER TABLE rooms ADD COLUMN extra_max INTEGER'),
      ]);
      // [id, ไม่รวมอาหารเช้า, รวมอาหารเช้า, เสริมเตียงได้สูงสุด]
      const P = [
        ['R1', 2200, 2800, 5], ['R2', 1600, 2000, 4], ['R3', 1800, 2200, 2],
        ['R4', 1800, 2200, 2], ['R5',  800, 1000, 1], ['R6',  800, 1000, 1],
        ['R7', 1600, 2000, 4], ['R8', 3000, 4000, 2], ['R9', 3000, 4000, 2],
      ];
      for (const t of ['T1','T2','T3','T4','T5','T6','T7','T8']) P.push([t, 600, 800, 0]);
      await db.batch(P.map(([id, np, bp, ex]) =>
        db.prepare('UPDATE rooms SET price = ?, price_bf = ?, extra_max = ? WHERE id = ?')
          .bind(np, bp, ex, id)));
    }
  }

  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM rooms').first();
  if (c === 0) {
    await db.batch(SEED_ROOMS.map(r =>
      db.prepare('INSERT INTO rooms (id,name,capacity,price,sort) VALUES (?,?,?,?,?)').bind(...r)));
  } else {
    // migration 19 ส.ค. 2026: เต็นท์มี 6 หลัง — DB เก่ามีแค่ T1
    const t2 = await db.prepare("SELECT id FROM rooms WHERE id = 'T2'").first();
    if (!t2) {
      await db.prepare("UPDATE rooms SET name = 'เต็นท์ 1' WHERE id = 'T1'").run();
      await db.batch(SEED_ROOMS.filter(r => /^T[2-6]$/.test(r[0])).map(r =>
        db.prepare('INSERT OR IGNORE INTO rooms (id,name,capacity,price,sort) VALUES (?,?,?,?,?)').bind(...r)));
    }
  }
  // migration 19 ส.ค. 2026 (2): เต็นท์มี 8 หลัง — เพิ่ม T7-T8 + ย้ายรายการนำเข้าที่เคยติดป้าย X:
  const t7 = await db.prepare("SELECT id FROM rooms WHERE id = 'T7'").first();
  if (!t7) {
    await db.batch(SEED_ROOMS.filter(r => /^T[78]$/.test(r[0])).map(r =>
      db.prepare('INSERT OR IGNORE INTO rooms (id,name,capacity,price,sort) VALUES (?,?,?,?,?)').bind(...r)));
    await db.prepare("UPDATE bookings SET room = 'T7' WHERE room = 'X:เต้นท์หลังเล็ก7'").run();
    await db.prepare("UPDATE bookings SET room = 'T8' WHERE room = 'X:เต้นท์หลังเล็ก8'").run();
  }
  const { u } = await db.prepare('SELECT COUNT(*) AS u FROM users').first();
  if (u === 0) {
    await db.prepare('INSERT INTO users (username,pass,role,created) VALUES (?,?,?,?)')
      .bind('admin', await makePw('2569'), 'admin', nowStamp()).run();
  }
  ready = true;
}

/* ── Fail-safe: สมุดบัญชีถาวร + สำเนานอกระบบ (ห้ามทำการจองล้มไม่ว่ากรณีใด) ── */
async function auditLog(env, ctx, actor, action, ref, data) {
  try {
    await env.DB.prepare('INSERT INTO audit (ts,actor,action,ref,data) VALUES (?,?,?,?,?)')
      .bind(nowStamp(), actor, action, ref, JSON.stringify(data)).run();
  } catch (e) {}
  try {
    if (!env.GH_LOG_TOKEN || !env.GH_LOG_REPO) return;
    const ts = nowStamp();
    const lines = [`[${action}] ${ts} โดย ${actor}`, `รหัส: ${ref}`];
    for (const [k, v] of Object.entries(data)) if (v) lines.push(`${k}: ${v}`);
    const text = lines.join('\n') + '\n';
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    const path = `log/${ts.slice(0, 7)}/${ts.replace(/[: ]/g, '-')}_${action}_${ref}.txt`;
    const p = fetch(`https://api.github.com/repos/${env.GH_LOG_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + env.GH_LOG_TOKEN, 'User-Agent': 'thongwai-worker',
                 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({ message: `${action} ${ref}`, content: b64 }),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  } catch (e) {}
}

/* ── ตรวจตัวตนต่อคำขอ: คืน {username, role} หรือ null ── */
async function auth(db, p) {
  const username = (p.get('user') || '').trim();
  const row = await db.prepare('SELECT username, pass, role FROM users WHERE username = ?').bind(username).first();
  if (!row) return null;
  if (!(await checkPw(p.get('pass') || '', row.pass))) return null;
  return { username: row.username, role: row.role };
}

/* ── จัดการผู้ใช้ (เฉพาะ admin) ── */
async function userAdd(db, p) {
  const username = (p.get('username') || '').trim();
  const password = p.get('password') || '';
  if (!/^[a-zA-Z0-9ก-๙_.-]{2,32}$/.test(username)) return { ok: false, error: 'ชื่อผู้ใช้ 2-32 ตัว (ไทย/อังกฤษ/ตัวเลข)' };
  if (password.length < 4) return { ok: false, error: 'รหัสผ่านอย่างน้อย 4 ตัว' };
  const dup = await db.prepare('SELECT username FROM users WHERE username = ?').bind(username).first();
  if (dup) return { ok: false, error: 'มีชื่อผู้ใช้นี้แล้ว' };
  await db.prepare('INSERT INTO users (username,pass,role,created) VALUES (?,?,?,?)')
    .bind(username, await makePw(password), 'staff', nowStamp()).run();
  return { ok: true };
}
async function userDel(db, p, me) {
  const username = (p.get('username') || '').trim();
  if (username === me.username) return { ok: false, error: 'ลบบัญชีตัวเองไม่ได้' };
  const row = await db.prepare('SELECT role FROM users WHERE username = ?').bind(username).first();
  if (!row) return { ok: false, error: 'ไม่พบผู้ใช้ ' + username };
  if (row.role === 'admin') return { ok: false, error: 'ลบบัญชี admin ไม่ได้' };
  await db.prepare('DELETE FROM users WHERE username = ?').bind(username).run();
  return { ok: true };
}
async function userSetPw(db, p) {
  const username = (p.get('username') || '').trim();
  const password = p.get('password') || '';
  if (password.length < 4) return { ok: false, error: 'รหัสผ่านอย่างน้อย 4 ตัว' };
  const res = await db.prepare('UPDATE users SET pass = ? WHERE username = ?')
    .bind(await makePw(password), username).run();
  return res.meta.changes ? { ok: true } : { ok: false, error: 'ไม่พบผู้ใช้ ' + username };
}

/* ── actions ── */
async function availability(db, p) {
  const from = isDate(p.get('from')) ? p.get('from') : todayStr();
  const days = Math.min(Number(p.get('days')) || 30, 120);
  const to = addDays(from, days);
  const rooms = (await db.prepare('SELECT id,name FROM rooms ORDER BY sort').all()).results;
  const rows = (await db.prepare(
    `SELECT room, checkin, checkout FROM bookings
     WHERE status = 'จอง' AND checkin < ? AND checkout > ?`).bind(to, from).all()).results;
  const booked = {};
  for (const b of rows) {
    booked[b.room] = booked[b.room] || [];
    for (let d = b.checkin < from ? from : b.checkin; d < b.checkout && d < to; d = addDays(d, 1)) {
      booked[b.room].push(d);
    }
  }
  return { ok: true, from, to, rooms, booked };
}

async function listBookings(db, p) {
  const from = isDate(p.get('from')) ? p.get('from') : addDays(todayStr(), -60);
  const to = isDate(p.get('to')) ? p.get('to') : addDays(todayStr(), 120);
  const bookings = (await db.prepare(
    `SELECT id,room,checkin,checkout,name,phone,note,status,created,staff,pay,slip,contact,bf,beds FROM bookings
     WHERE checkin < ? AND checkout > ? ORDER BY checkin`).bind(to, from).all()).results;
  return { ok: true, bookings };
}

async function addBooking(db, p, me) {
  const room = p.get('room'), checkin = p.get('checkin'), checkout = p.get('checkout'),
        name = (p.get('name') || '').trim();
  if (!room || !name) return { ok: false, error: 'ข้อมูลไม่ครบ' };
  if (!isDate(checkin) || !isDate(checkout)) return { ok: false, error: 'รูปแบบวันที่ต้องเป็น yyyy-mm-dd' };
  if (checkout <= checkin) return { ok: false, error: 'วันเช็คเอาท์ต้องหลังวันเช็คอิน' };
  const r = await db.prepare('SELECT id FROM rooms WHERE id = ?').bind(room).first();
  if (!r) return { ok: false, error: 'ไม่พบห้อง ' + room };

  const id = 'B' + Date.now() + Math.random().toString(36).slice(2, 5);
  // INSERT แบบมีเงื่อนไขในคำสั่งเดียว = atomic กันจองซ้อนแม้กดพร้อมกันสองเครื่อง
  const res = await db.prepare(
    `INSERT INTO bookings (id,room,checkin,checkout,name,phone,note,status,created,staff)
     SELECT ?,?,?,?,?,?,?,?,?,?
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE room = ? AND status = 'จอง' AND checkin < ? AND ? < checkout)`)
    .bind(id, room, checkin, checkout, name, p.get('phone') || '', p.get('note') || '',
          'จอง', nowStamp(), me.username,
          room, checkout, checkin)
    .run();
  if (res.meta.changes === 0) {
    const clash = await db.prepare(
      `SELECT checkin, checkout FROM bookings
       WHERE room = ? AND status = 'จอง' AND checkin < ? AND ? < checkout LIMIT 1`)
      .bind(room, checkout, checkin).first();
    return { ok: false, error: 'ห้องนี้ถูกจองแล้วช่วง ' + clash.checkin + ' → ' + clash.checkout };
  }
  return { ok: true, id };
}

async function cancelBooking(db, p) {
  const res = await db.prepare(`UPDATE bookings SET status = 'ยกเลิก' WHERE id = ?`)
    .bind(p.get('id') || '').run();
  return res.meta.changes ? { ok: true } : { ok: false, error: 'ไม่พบการจอง ' + p.get('id') };
}


/* ══════════════ จองออนไลน์ + มัดจำ (public — ไม่ต้อง login) ══════════════ */

const HOLD_MS   = 5 * 60 * 1000;   // ถือห้อง 5 นาที
const GRACE_MS  = 5 * 60 * 1000;   // ต่อให้เงียบๆ อีก 5 นาที "เฉพาะเมื่อไม่มีใครรอ"
const DEPOSIT   = 1.0;             // ★ เก็บเต็มจำนวน (6 ก.ย. 2026 — เดิม 0.5) แก้ตัวเลขนี้ตัวเดียวพอ

// ปล่อยห้องที่ถือไว้แล้วไม่จ่าย — เรียกก่อนทุก query ที่อ่านห้องว่าง
// ต่อเวลาให้อัตโนมัติถ้ายังไม่มีใครมาสนใจห้องนั้น (มี waiting=0) เพื่อไม่ตัดลูกค้าจริงทิ้งฟรีๆ
async function sweepHolds(db) {
  const now = Date.now();
  await db.prepare(
    `UPDATE bookings SET status = 'ยกเลิก', pay = 'expired'
     WHERE pay = 'hold' AND expires IS NOT NULL AND expires < ?`).bind(now).run();
}

function nightsOf(checkin, checkout) {
  return Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
}

const WEEKEND_UP = 1.20;      // ★ ศุกร์+เสาร์ บวก 20% — คิดในราคาเลย ไม่แยกให้ลูกค้าเห็น
const BED_NOBF = 200, BED_BF = 300;   // ★ เตียงเสริมต่อคืน

// ศุกร์ = 5, เสาร์ = 6 (คิดจากวันที่เข้าพักของแต่ละคืน)
const isWeekendNight = d => [5, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay());

// คิดราคาทีละคืน เพราะแต่ละคืนอาจคนละเรต
function priceStay(r, checkin, checkout, bf, beds) {
  const base = bf ? r.price_bf : r.price;
  let total = 0;
  for (let d = checkin; d < checkout; d = addDaysStr(d, 1)) {
    total += Math.round(base * (isWeekendNight(d) ? WEEKEND_UP : 1));
    total += beds * (bf ? BED_BF : BED_NOBF);   // เตียงเสริมไม่ปรับตามวัน
  }
  return total;
}

async function quote(db, p) {
  const room = p.get('room') || '', checkin = p.get('checkin') || '', checkout = p.get('checkout') || '';
  if (!isDate(checkin) || !isDate(checkout)) return { ok: false, error: 'รูปแบบวันที่ต้องเป็น yyyy-mm-dd' };
  if (checkout <= checkin) return { ok: false, error: 'วันเช็คเอาท์ต้องหลังวันเช็คอิน' };
  const r = await db.prepare(
    'SELECT id,name,price,price_bf,capacity,extra_max FROM rooms WHERE id = ?').bind(room).first();
  if (!r) return { ok: false, error: 'ไม่พบห้อง ' + room };

  const bf = p.get('bf') === '1' && r.price_bf != null;
  const beds = Math.min(Math.max(0, Number(p.get('beds')) || 0), r.extra_max || 0);
  const nights = nightsOf(checkin, checkout);
  const total = priceStay(r, checkin, checkout, bf, beds);
  return { ok: true, room: r.id, roomName: r.name, nights, bf, beds,
           hasBf: r.price_bf != null, extraMax: r.extra_max || 0,
           price: bf ? r.price_bf : r.price,
           total, deposit: Math.ceil(total * DEPOSIT) };
}

// ถือห้อง — INSERT เงื่อนไขเดียวแบบ atomic เหมือน addBooking
// กดพร้อมกันสองเครื่องในวินาทีเดียว ฐานข้อมูลให้ผ่านคนเดียวเสมอ ไม่มีทางได้ QR ทั้งคู่
async function holdRoom(db, p) {
  await sweepHolds(db);
  const q = await quote(db, p);
  if (!q.ok) return q;
  const room = q.room, checkin = p.get('checkin'), checkout = p.get('checkout');
  const name = (p.get('name') || '').trim(), phone = (p.get('phone') || '').trim();
  const ch = (p.get('ch') || '').trim(), chid = (p.get('chid') || '').trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: 'กรุณากรอกชื่อผู้จอง' };
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) return { ok: false, error: 'กรุณากรอกเบอร์โทรให้ถูกต้อง' };
  // ที่พักอยู่ลาว ลูกค้าไทยให้เบอร์ไทย → ต้องมีช่องทางออนไลน์ไว้ติดต่อกลับเสมอ
  if (ch !== 'phone' && chid.length < 2) return { ok: false, error: 'กรุณากรอกช่องทางติดต่อ' };
  const contact = ch === 'phone' ? 'โทรตามเบอร์ที่ให้ไว้' : `${ch}: ${chid}`;

  // กันคนเดิมกดรัวจนล็อกห้องไว้หลายห้องพร้อมกัน
  const mine = await db.prepare(
    `SELECT COUNT(*) AS c FROM bookings WHERE phone = ? AND pay IN ('hold','slip') AND status = 'จอง'`)
    .bind(phone).first();
  if (mine.c >= 2) return { ok: false, error: 'เบอร์นี้มีรายการที่ยังไม่ชำระค้างอยู่ กรุณาชำระให้เสร็จก่อน' };

  const id = 'W' + Date.now() + Math.random().toString(36).slice(2, 5);
  const tok = hex(crypto.getRandomValues(new Uint8Array(16)));
  const expires = Date.now() + HOLD_MS;
  const res = await db.prepare(
    `INSERT INTO bookings (id,room,checkin,checkout,name,phone,note,status,created,staff,pay,expires,tok,amount,contact,bf,beds)
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE room = ? AND status = 'จอง' AND checkin < ? AND ? < checkout)`)
    .bind(id, room, checkin, checkout, name, phone, 'จองผ่านเว็บ', 'จอง', nowStamp(), 'เว็บไซต์',
          'hold', expires, tok, q.deposit, contact, q.bf ? 1 : 0, q.beds,
          room, checkout, checkin)
    .run();

  if (res.meta.changes === 0) {
    // มีคนได้ไปก่อน — บอกไปเลยว่าอีกกี่นาทีจะรู้ผล คนรอจะได้ตัดสินใจเองว่าจะรอหรือเปลี่ยนห้อง
    const clash = await db.prepare(
      `SELECT pay, expires FROM bookings
       WHERE room = ? AND status = 'จอง' AND checkin < ? AND ? < checkout LIMIT 1`)
      .bind(room, checkout, checkin).first();
    const holding = clash && clash.pay === 'hold' && clash.expires > Date.now();
    return { ok: false, taken: true, holding,
             secondsLeft: holding ? Math.ceil((clash.expires - Date.now()) / 1000) : 0,
             alternatives: await freeRooms(db, checkin, checkout, q.price),
             error: holding ? 'มีคนกำลังจองห้องนี้อยู่' : 'ห้องนี้ถูกจองแล้ว' };
  }
  return { ok: true, id, tok, expires, deposit: q.deposit, total: q.total,
           nights: q.nights, roomName: q.roomName };
}

// ห้องอื่นที่ยังว่างช่วงเดียวกัน — เรียงห้องราคาใกล้เคียงขึ้นก่อน
async function freeRooms(db, checkin, checkout, nearPrice) {
  const rows = (await db.prepare(
    `SELECT id,name,price,price_bf,capacity,extra_max FROM rooms
     WHERE id NOT IN (
       SELECT room FROM bookings WHERE status = 'จอง' AND checkin < ? AND ? < checkout)
     ORDER BY sort`).bind(checkout, checkin).all()).results;
  return rows
    .map(r => {
      const total = priceStay(r, checkin, checkout, false, 0);
      return { ...r, total, deposit: Math.ceil(total * DEPOSIT) };
    })
    .sort((a, b) => Math.abs(a.price - nearPrice) - Math.abs(b.price - nearPrice))
    .slice(0, 4);
}

// สถานะการถือห้อง — หน้าเว็บ poll เพื่อนับถอยหลัง
async function holdStatus(db, p) {
  const b = await db.prepare(
    `SELECT b.id,b.room,r.name AS roomName,b.checkin,b.checkout,b.name,b.phone,
            b.pay,b.expires,b.amount,b.status
     FROM bookings b LEFT JOIN rooms r ON r.id = b.room
     WHERE b.id = ? AND b.tok = ?`)
    .bind(p.get('id') || '', p.get('tok') || '').first();
  if (!b) return { ok: false, error: 'ไม่พบรายการนี้' };
  if (b.pay === 'hold' && b.expires < Date.now()) return { ok: true, state: 'expired' };
  return { ok: true,
           state: b.status === 'ยกเลิก' ? 'cancelled' : (b.pay || 'confirmed'),
           secondsLeft: b.pay === 'hold' ? Math.ceil((b.expires - Date.now()) / 1000) : null,
           id: b.id, roomName: b.roomName || b.room, checkin: b.checkin, checkout: b.checkout,
           name: b.name, phone: b.phone, amount: b.amount };
}

// ลูกค้ากดยกเลิกเอง — ปล่อยห้องคืนทันที ไม่ต้องรอหมดเวลา
async function releaseHold(db, p) {
  const res = await db.prepare(
    `UPDATE bookings SET status = 'ยกเลิก', pay = 'ยกเลิกเอง'
     WHERE id = ? AND tok = ? AND pay = 'hold'`)
    .bind(p.get('id') || '', p.get('tok') || '').run();
  return { ok: res.meta.changes > 0 };
}


/* ══════════════ QR พร้อมเพย์ + สลิป ══════════════ */

const LAK_PER_THB = 650;   // ★ อัตราแลกเปลี่ยนคงที่ — เปลี่ยนตรงนี้บรรทัดเดียวพอ

// สร้าง payload ตามมาตรฐาน EMVCo / Thai QR Payment
function promptpayPayload(target, amount) {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const t = String(target).replace(/\D/g, '');
  // เบอร์มือถือ 10 หลัก → 0066xxxxxxxxx | เลขบัตรประชาชน/ภาษี 13 หลัก → ใส่ตรงๆ
  const acc = t.length >= 13 ? f('02', t) : f('01', '0066' + t.replace(/^0/, ''));
  let p = f('00', '01') + f('01', amount ? '12' : '11')
        + f('29', f('00', 'A000000677010111') + acc)
        + f('53', '764') + (amount ? f('54', Number(amount).toFixed(2)) : '') + f('58', 'TH');
  p += '6304';
  let crc = 0xFFFF;
  for (const ch of p) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return p + crc.toString(16).toUpperCase().padStart(4, '0');
}

// วาด QR เป็น SVG ฝั่งเซิร์ฟเวอร์ — เลขพร้อมเพย์ไม่เคยหลุดออกไปถึงเบราว์เซอร์ลูกค้า
function qrSvg(text, px = 320) {
  const q = qrcode(0, 'M');           // โหมด Byte (ทดสอบถอดกลับได้ถูกต้อง)
  q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR พร้อมเพย์">`
       + `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

async function payQr(db, p, env) {
  const b = await db.prepare(
    `SELECT id,amount,pay,expires,status FROM bookings WHERE id = ? AND tok = ?`)
    .bind(p.get('id') || '', p.get('tok') || '').first();
  if (!b || b.status === 'ยกเลิก') return new Response('ไม่พบรายการ', { status: 404 });
  if (!env.PROMPTPAY_ID) return new Response('ยังไม่ได้ตั้งค่า PROMPTPAY_ID', { status: 500 });
  const svg = qrSvg(promptpayPayload(env.PROMPTPAY_ID, b.amount));
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
}

// รับสลิป — เก็บลง R2 แล้วหยุดนาฬิกาทันที ห้องถูกถือไว้จนพนักงานตัดสินใจ
async function uploadSlip(request, db, p, env) {
  const id = p.get('id') || '', tok = p.get('tok') || '';
  const b = await db.prepare(
    `SELECT id,room,checkin,checkout,name,phone,amount,pay,status FROM bookings WHERE id = ? AND tok = ?`)
    .bind(id, tok).first();
  if (!b) return { ok: false, error: 'ไม่พบรายการนี้' };
  if (b.status === 'ยกเลิก') return { ok: false, error: 'รายการนี้หมดเวลาไปแล้ว กรุณาจองใหม่' };

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return { ok: false, error: 'ไม่พบไฟล์สลิป' };
  if (buf.byteLength > 3_000_000) return { ok: false, error: 'ไฟล์ใหญ่เกินไป' };
  if (buf.byteLength < 4_000) return { ok: false, error: 'ไฟล์เล็กเกินไป ไม่น่าจะเป็นสลิป' };
  // เช็คหัวไฟล์จริง ไม่เชื่อนามสกุลหรือ content-type ที่เบราว์เซอร์บอกมา
  const head = new Uint8Array(buf.slice(0, 12));
  const isJpg = head[0] === 0xFF && head[1] === 0xD8;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
  const isWebp = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  if (!isJpg && !isPng && !isWebp)
    return { ok: false, error: 'ไฟล์นี้ไม่ใช่รูปภาพ กรุณาแนบรูปสลิปโอนเงิน' };
  const key = `slips/${id}.jpg`;
  await env.SLIPS.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } });

  // expires = NULL → sweepHolds ไม่แตะอีก ห้องถูกถือไว้ไม่มีกำหนดจนกว่าพนักงานจะกด
  await db.prepare(
    `UPDATE bookings SET pay = 'slip', slip = ?, expires = NULL WHERE id = ?`).bind(key, id).run();
  return { ok: true, booking: b };
}

// ส่งรูปสลิปให้หน้า admin (ต้อง login แล้วเท่านั้น)
async function slipImage(db, p, env) {
  const b = await db.prepare('SELECT slip FROM bookings WHERE id = ?').bind(p.get('id') || '').first();
  if (!b || !b.slip) return new Response('ไม่มีสลิป', { status: 404 });
  const obj = await env.SLIPS.get(b.slip);
  if (!obj) return new Response('ไม่พบไฟล์', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}


/* ══════════════ ตรวจสลิป (หลัง login) ══════════════ */

// รายการที่จ่ายแล้วรอตรวจ + ที่ยังถือห้องอยู่ (ยังไม่จ่าย) เพื่อให้เห็นภาพรวม
async function pendingSlips(db) {
  await sweepHolds(db);
  const rows = (await db.prepare(
    `SELECT b.id,b.room,r.name AS roomName,b.checkin,b.checkout,b.name,b.phone,b.contact,
            b.amount,b.pay,b.created,b.expires,b.slip
     FROM bookings b LEFT JOIN rooms r ON r.id = b.room
     WHERE b.status = 'จอง' AND b.pay IN ('slip','hold')
     ORDER BY CASE b.pay WHEN 'slip' THEN 0 ELSE 1 END, b.created`).all()).results;
  return { ok: true, rows, waiting: rows.filter(r => r.pay === 'slip').length };
}

// พนักงานยืนยัน — pay = NULL แปลว่ากลายเป็นการจองปกติเหมือนที่คีย์มือ
async function confirmSlip(db, p, me) {
  const res = await db.prepare(
    `UPDATE bookings SET pay = NULL, expires = NULL, staff = ?
     WHERE id = ? AND pay = 'slip' AND status = 'จอง'`)
    .bind(me.username, p.get('id') || '').run();
  return res.meta.changes ? { ok: true } : { ok: false, error: 'รายการนี้ถูกจัดการไปแล้ว' };
}

// ปฏิเสธ/ยกเลิก — ปล่อยห้องคืนทันที บันทึกเหตุผลไว้ (เผื่อต้องโอนคืน)
async function rejectSlip(db, p, me) {
  const reason = (p.get('reason') || '').slice(0, 200);
  const res = await db.prepare(
    `UPDATE bookings SET status = 'ยกเลิก', pay = 'ปฏิเสธ', staff = ?,
       note = COALESCE(note,'') || ' · ปฏิเสธสลิป: ' || ?
     WHERE id = ? AND status = 'จอง' AND pay IN ('slip','hold')`)
    .bind(me.username, reason || 'ไม่ระบุเหตุผล', p.get('id') || '').run();
  return res.meta.changes ? { ok: true } : { ok: false, error: 'รายการนี้ถูกจัดการไปแล้ว' };
}


// ค้นหาการจองด้วยชื่อ + เลขท้ายเบอร์ 4 ตัว — สำหรับลูกค้าที่ทำลิงก์หาย
// จงใจไม่คืน tok กลับไป: ผู้ค้นเห็นได้แค่สรุปการจองตัวเอง เอาไปทำอย่างอื่นไม่ได้
async function lookupBooking(db, p) {
  const name = (p.get('name') || '').trim().replace(/\s+/g, ' ');
  const last4 = (p.get('last4') || '').replace(/\D/g, '');
  if (name.length < 2 || last4.length !== 4)
    return { ok: false, error: 'กรุณากรอกชื่อและเลขท้ายเบอร์โทร 4 ตัว' };

  await sweepHolds(db);
  const rows = (await db.prepare(
    `SELECT b.id,r.name AS roomName,b.checkin,b.checkout,b.name,b.amount,b.pay,b.status
     FROM bookings b LEFT JOIN rooms r ON r.id = b.room
     WHERE b.status = 'จอง' AND b.checkout >= ?
       AND REPLACE(REPLACE(b.phone,'-',''),' ','') LIKE ?
       AND LOWER(TRIM(b.name)) = LOWER(?)
     ORDER BY b.checkin LIMIT 5`)
    .bind(todayStr(), '%' + last4, name).all()).results;

  if (!rows.length) return { ok: true, rows: [] };
  return { ok: true, rows: rows.map(b => ({
    id: b.id, roomName: b.roomName, checkin: b.checkin, checkout: b.checkout,
    name: b.name, amount: b.amount,
    state: b.pay === 'slip' ? 'slip' : (b.pay === 'hold' ? 'hold' : 'confirmed')
  })) };
}

/* ── router ── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api') return env.ASSETS.fetch(request);

    try {
      await init(env.DB);
      const p = url.searchParams;
      const action = p.get('action');
      // ── public: ไม่ต้อง login ──
      if (action === 'availability') { await sweepHolds(env.DB); return json(await availability(env.DB, p)); }
      if (action === 'quote')       return json(await quote(env.DB, p));
      if (action === 'hold')        return json(await holdRoom(env.DB, p));
      if (action === 'holdstatus')  return json(await holdStatus(env.DB, p));
      if (action === 'lookup')      return json(await lookupBooking(env.DB, p));
      if (action === 'release')     return json(await releaseHold(env.DB, p));
      if (action === 'payqr')       return await payQr(env.DB, p, env);
      if (action === 'slip')        return json(await uploadSlip(request, env.DB, p, env));

      const me = await auth(env.DB, p);
      if (!me) return json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

      switch (action) {
        case 'login': return json({ ok: true, user: me.username, role: me.role });
        case 'rooms': {
          const rooms = (await env.DB.prepare('SELECT id,name,capacity,price FROM rooms ORDER BY sort').all()).results;
          return json({ ok: true, rooms });
        }
        case 'slipimg': return await slipImage(env.DB, p, env);
        case 'pending':  return json(await pendingSlips(env.DB));
        case 'slipok':   { const r = await confirmSlip(env.DB, p, me); await auditLog(env, ctx, me.username, 'ยืนยันสลิป', p.get('id'), {}); return json(r); }
        case 'slipno':   { const r = await rejectSlip(env.DB, p, me);  await auditLog(env, ctx, me.username, 'ปฏิเสธสลิป', p.get('id'), { reason: p.get('reason') }); return json(r); }
        case 'bookings': return json(await listBookings(env.DB, p));
        case 'booked_on': {
          const dt = p.get('date');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dt || '')) return json({ ok: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' });
          const bookings = (await env.DB.prepare(
            `SELECT id,room,checkin,checkout,name,phone,note,status,created,staff,pay,slip,contact,bf,beds FROM bookings
             WHERE created LIKE ? ORDER BY created, id`).bind(dt + '%').all()).results;
          return json({ ok: true, bookings });
        }
        case 'add': {
          const r = await addBooking(env.DB, p, me);
          if (r.ok) await auditLog(env, ctx, me.username, 'จอง', r.id, {
            ห้อง: p.get('room'), ชื่อ: p.get('name'), เบอร์: p.get('phone') || '',
            เช็คอิน: p.get('checkin'), เช็คเอาท์: p.get('checkout'), หมายเหตุ: p.get('note') || '' });
          return json(r);
        }
        case 'cancel': {
          const id = p.get('id');
          const row = await env.DB.prepare('SELECT room,name,checkin,checkout FROM bookings WHERE id = ?').bind(id).first();
          const r = await cancelBooking(env.DB, p);
          if (r.ok) await auditLog(env, ctx, me.username, 'ยกเลิก', id, row || {});
          return json(r);
        }
        case 'move': {
          const id = p.get('id'), room = p.get('room'),
                checkin = p.get('checkin'), checkout = p.get('checkout');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkout || ''))
            return json({ ok: false, error: 'รูปแบบวันที่ต้องเป็น yyyy-mm-dd' });
          if (checkout <= checkin) return json({ ok: false, error: 'วันเช็คเอาท์ต้องหลังวันเช็คอิน' });
          const b = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
          if (!b) return json({ ok: false, error: 'ไม่พบรายการจอง' });
          if (b.status !== 'จอง') return json({ ok: false, error: 'รายการนี้ถูกยกเลิกไปแล้ว' });
          const target = room || b.room;
          if (!(await env.DB.prepare('SELECT id FROM rooms WHERE id = ?').bind(target).first()))
            return json({ ok: false, error: 'ไม่พบห้อง ' + target });
          // UPDATE แบบมีเงื่อนไขคำสั่งเดียว = atomic (ไม่นับตัวเองเป็นคู่ชน)
          const res = await env.DB.prepare(
            `UPDATE bookings SET room = ?, checkin = ?, checkout = ?
             WHERE id = ? AND status = 'จอง' AND NOT EXISTS (
               SELECT 1 FROM bookings
               WHERE room = ? AND status = 'จอง' AND id != ?
                 AND checkin < ? AND ? < checkout)`)
            .bind(target, checkin, checkout, id, target, id, checkout, checkin).run();
          if (res.meta.changes === 0) {
            // ชน — หาว่าห้องไหนว่างช่วงนั้นเสนอ admin
            const free = (await env.DB.prepare(
              `SELECT id, name FROM rooms WHERE id NOT IN (
                 SELECT room FROM bookings
                 WHERE status = 'จอง' AND id != ? AND checkin < ? AND ? < checkout)
               ORDER BY sort`).bind(id, checkout, checkin).all()).results;
            const clash = await env.DB.prepare(
              `SELECT name, checkin, checkout FROM bookings
               WHERE room = ? AND status = 'จอง' AND id != ? AND checkin < ? AND ? < checkout LIMIT 1`)
              .bind(target, id, checkout, checkin).first();
            return json({ ok: false, clash: true, free,
              error: `ห้องนี้ไม่ว่างช่วงที่เลือก — ชนกับ "${clash ? clash.name : ''}" (${clash ? clash.checkin : ''} → ${clash ? clash.checkout : ''})` });
          }
          await auditLog(env, ctx, me.username, 'เลื่อน', id, {
            ชื่อ: b.name, จาก: `${b.room} ${b.checkin} → ${b.checkout}`,
            เป็น: `${target} ${checkin} → ${checkout}` });
          return json({ ok: true });
        }
        /* ── สถิติเจ้าของ v2 (23 ส.ค. 2026) ────────────────────────────
           เพิ่ม: 90 วันข้างหน้า / คืนที่เต็มทุกหลัง / อัตรายกเลิก /
           pace เทียบปีที่แล้ว ณ จุดเดียวกัน / รายวันสัปดาห์แยกฤดู / n ทุกตัว
           ความแม่น: ห้องประวัติ "X:..." ไม่อยู่ในตาราง rooms จึงไม่นับใน
           occupancy (ไม่งั้น % ทะลุ 100) — แยกรายงานเป็น legacyNights ── */
        case 'stats': {
          if (me.role !== 'admin') return json({ ok: false, error: 'เฉพาะเจ้าของเท่านั้น' });
          const rooms = (await env.DB.prepare('SELECT id,name,sort,price FROM rooms ORDER BY sort').all()).results;
          const all = (await env.DB.prepare(
            'SELECT room,checkin,checkout,created,phone,name,status FROM bookings').all()).results;
          const roomSet = new Set(rooms.map(r => r.id));
          const CAP = rooms.length || 1;
          const today = todayStr();
          const d365 = addDaysStr(today, -365), d30 = addDaysStr(today, -30);
          const d730 = addDaysStr(today, -730);   // ฐานอ้างอิงใช้ 2 ปี เพื่อให้แต่ละ (ฤดู × วัน) มี n พอ
          const N = s => new Date(s + 'T00:00:00Z');
          const nightsOf = b => Math.max(1, Math.round((N(b.checkout) - N(b.checkin)) / 864e5));
          const leadOf = b => {
            const cd = (b.created || '').slice(0, 10);
            if (!isDate(cd)) return -1;
            return Math.max(0, Math.round((N(b.checkin) - N(cd)) / 864e5));
          };
          const leadBucket = ld => ld === 0 ? 0 : ld <= 3 ? 1 : ld <= 7 ? 2 : ld <= 14 ? 3 : ld <= 30 ? 4 : 5;

          const bs = all.filter(b => b.status === 'จอง');
          const cx = all.filter(b => b.status !== 'จอง');

          /* ── ไล่รายคืนครั้งเดียว เก็บลง perDay แล้วใช้ต่อทุกกราฟ ── */
          const perDay = {}, perRoom = {}, months = {}, lead = [0,0,0,0,0,0],
                stay = [0,0,0,0], repeat = {};
          const LEADS = [0, 3, 7, 14, 30, 60];        // จุดวัดเส้นโค้งการจอง (วันก่อนเข้าพัก)
          const pkOn = LEADS.map(() => 0);
          let pkFinal = 0, totalNights = 0, futureBookings = 0, legacyNights = 0;
          let firstNight = '9999-12-31';   // วันแรกที่มีข้อมูลจริง — กันไม่ให้ช่วงก่อนเปิดกิจการถูกนับเป็น "ขายไม่ได้"
          for (const b of bs) {
            const nights = nightsOf(b);
            totalNights += nights;
            if (b.checkin >= today) futureBookings++;
            stay[Math.min(nights, 4) - 1]++;
            const ld = leadOf(b);
            if (ld >= 0) lead[leadBucket(ld)]++;
            const ph = (b.phone || '').replace(/\D/g, '');
            if (ph.length >= 5) {
              repeat[ph] = repeat[ph] || { n: 0, name: b.name, last: b.checkin };
              repeat[ph].n++;
              if (b.checkin > repeat[ph].last) { repeat[ph].last = b.checkin; repeat[ph].name = b.name; }
            }
            const real = roomSet.has(b.room);
            if (!real) legacyNights += nights;
            let d = b.checkin;
            while (d < b.checkout) {
              if (real) {
                if (d < firstNight) firstNight = d;
                perDay[d] = (perDay[d] || 0) + 1;
                months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + 1;
                if (d >= d365) perRoom[b.room] = (perRoom[b.room] || 0) + 1;
                /* เส้นโค้งการจอง: คืนนี้ถูกจองไว้ล่วงหน้ากี่วัน — ใช้แปลง
                   "ตอนนี้จองแล้วเท่านี้" เป็น "สุดท้ายน่าจะได้เท่าไร" */
                if (d < today && d >= d730 && ld >= 0) {
                  pkFinal++;
                  for (let k = 0; k < LEADS.length; k++) if (ld >= LEADS[k]) pkOn[k]++;
                }
              }
              d = addDaysStr(d, 1);
            }
          }

          /* ── ย้อนหลัง 365 วัน: รายวันสัปดาห์ (คิดเป็น %) + แยกฤดู + คืนที่เต็ม ── */
          const SEASONS = [
            { label: 'หนาว (พ.ย.–ก.พ.)', m: [11,12,1,2] },
            { label: 'ร้อน (มี.ค.–พ.ค.)', m: [3,4,5] },
            { label: 'ฝน (มิ.ย.–ต.ค.)',  m: [6,7,8,9,10] },
          ];
          const seasonOf = d => SEASONS.findIndex(s => s.m.includes(Number(d.slice(5, 7))));
          const dowN = [0,0,0,0,0,0,0], dowCap = [0,0,0,0,0,0,0];
          const seasonN = SEASONS.map(() => [0,0,0,0,0,0,0]);
          const seasonCap = SEASONS.map(() => [0,0,0,0,0,0,0]);
          const baseN = SEASONS.map(() => [0,0,0,0,0,0,0]);      // ฐานอ้างอิง 2 ปี
          const baseCap = SEASONS.map(() => [0,0,0,0,0,0,0]);
          const soldDates = [];
          let soldFull = 0, soldNear = 0, nights30 = 0, histN = 0, histCap = 0;
          const hStart = firstNight > d730 ? firstNight : d730;
          for (let d = hStart; d < today; d = addDaysStr(d, 1)) {
            const n = perDay[d] || 0, w = N(d).getUTCDay(), si = seasonOf(d);
            histN += n; histCap += CAP;
            if (si >= 0) { baseN[si][w] += n; baseCap[si][w] += CAP; }
            if (d < d365) continue;                              // ที่เหลือใช้หน้าต่าง 12 เดือนตามเดิม
            dowN[w] += n; dowCap[w] += CAP;
            if (si >= 0) { seasonN[si][w] += n; seasonCap[si][w] += CAP; }
            if (n >= CAP) { soldFull++; soldDates.push(d); }
            else if (n >= CAP * 0.9) soldNear++;
            if (d >= d30) nights30 += n;
          }
          const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
          const dowRows = dowN.map((v, i) => ({ n: v, cap: dowCap[i], pct: pct(v, dowCap[i]) }));
          const seasonRows = SEASONS.map((s, i) => ({
            label: s.label,
            dow: seasonN[i].map((v, w) => ({ n: v, cap: seasonCap[i][w], pct: pct(v, seasonCap[i][w]) })),
            n: seasonN[i].reduce((a, b) => a + b, 0),
          }));

          /* ── ข้างหน้า 90 วัน (ของจริงที่ตัดสินใจได้วันนี้) ── */
          const forward = [];
          let f30 = 0, f60 = 0, f90 = 0;
          for (let i = 0; i < 90; i++) {
            const d = addDaysStr(today, i), n = perDay[d] || 0;
            forward.push({ d, n });
            if (i < 30) f30 += n;
            if (i < 60) f60 += n;
            f90 += n;
          }


          /* ══ เครื่องมือชี้เป้า: วันไหนควรทำอะไร ════════════════════════
             หลักคิด: "จองน้อย" ไม่ใช่สัญญาณ — อังคารหน้าฝนจองน้อยคือเรื่องปกติ
             สัญญาณจริงคือ "น้อยกว่าที่วันแบบเดียวกันเคยทำได้" ณ ระยะเวลาเท่ากัน
             จึงต้องมี 2 ชิ้น: (1) ฐานอ้างอิงต่อ (ฤดู × วันในสัปดาห์)
             (2) เส้นโค้งการจอง — ปกติเหลืออีก X วัน ควรจองไปแล้วกี่ % ของยอดจบ ══ */

          // (1) ฐานอ้างอิง + shrinkage: ช่องที่ n น้อยจะถูกดึงเข้าหาค่าเฉลี่ยรวม
          //     กัน overfit จากช่องที่มีข้อมูลไม่กี่วัน (พารามิเตอร์เดียว = M)
          const M = 10 * CAP;                       // เท่ากับ "ยืมข้อมูลมา 10 คืน"
          const histPct = histCap ? histN / histCap : 0;
          const baseline = SEASONS.map((_, si) => [0,1,2,3,4,5,6].map(w => {
            const n = baseN[si][w], cap = baseCap[si][w];
            const raw = cap ? n / cap : 0;
            const adj = (n + M * histPct) / (cap + M);
            return { pct: Math.round(adj * 100), raw: Math.round(raw * 100), cap, days: Math.round(cap / CAP) };
          }));

          // (2) เส้นโค้งการจองจากของจริง 2 ปี
          const pickup = LEADS.map((L, k) => ({ lead: L, ratio: pkFinal ? pkOn[k] / pkFinal : 1 }));
          const ratioAt = L => {
            let r = 1;
            for (const p of pickup) if (L >= p.lead) r = p.ratio;
            return r > 0.02 ? r : 0.02;
          };

          const avgPrice = Math.round(
            rooms.reduce((a, r) => a + (Number(r.price) || 0), 0) / (rooms.length || 1));

          /* คาดการณ์รายวันข้างหน้า แล้วเทียบกับฐาน */
          const MIN_DAYS = 8;        // ช่องฐานต้องเคยเปิดขายจริงอย่างน้อย 8 ครั้ง ถึงจะเชื่อ
          const GAP_PP = 12;         // ต่ำกว่าฐานอย่างน้อย 12 จุด ถึงนับว่าผิดปกติ
          const ACT_FROM = 5, ACT_TO = 90;   // ใกล้กว่านี้ทำอะไรไม่ทัน
          /* ขอบเขตจริงมาจากข้อมูล ไม่ใช่ตัวเลขที่ตั้งเอง: ถ้าในอดีต ณ ระยะนั้น
             ยังแทบไม่มีใครจอง (เช่นลูกค้าที่นี่จองล่วงหน้าไม่เกินเดือน) การที่วันนั้น
             ยังว่างคือ "ปกติ" ไม่ใช่สัญญาณ — ห้ามเตือน ไม่งั้นได้เตือนลวงทุกวันศุกร์ยาวๆ */
          const MIN_RATIO = 0.15;
          const MIN_SHORT = 2;       // ห่างจากปกติน้อยกว่า 2 หลัง = ยังไม่ใช่เรื่อง
          const daily = forward.map((x, i) => {
            const w = N(x.d).getUTCDay(), si = seasonOf(x.d);
            const b = si >= 0 ? baseline[si][w] : null;
            const r = ratioAt(i);
            const expRooms = Math.min(CAP, x.n / r);
            const expPct = Math.round(expRooms / CAP * 100);
            const basePct = b ? b.pct : 0;
            const gap = basePct - expPct;
            /* กรองด้วยหน่วยที่ "วัดได้จริงวันนี้" ไม่ใช่หน่วยที่คำนวณต่อ:
               วันแบบนี้ ณ ระยะนี้ ปกติควรจองไปแล้วกี่หลัง เทียบกับที่จองจริง
               — ถ้าห่างกันไม่ถึง 2 หลัง มันคือ noise ไม่ใช่ปัญหา ต่อให้ % ดูน่าตกใจ
               (ฐาน 14% → คาด 0% ดูเหมือนพัง แต่จริงๆ ต่างกันแค่ครึ่งหลัง) */
            const shortNow = basePct / 100 * CAP * r - x.n;
            const solid = !!b && b.days >= MIN_DAYS && pkFinal > 0 && r >= MIN_RATIO;
            return { d: x.d, w, out: i, booked: x.n, expPct, basePct, gap,
                     expRooms, solid, shortNow: Math.round(shortNow * 10) / 10,
                     flag: solid && i >= ACT_FROM && i <= ACT_TO && gap >= GAP_PP
                           && gap / 100 * CAP >= 1.5 && shortNow >= MIN_SHORT };
          });

          /* รวมวันติดกันเป็นช่วง แล้วเรียงตามเงินที่เสี่ยงจะหายจริง (ราคาป้ายเฉลี่ย) */
          let horizon = 0;
          for (let i = 0; i < daily.length; i++) if (daily[i].solid) horizon = i;
          const alerts = [];
          for (let i = 0; i < daily.length; i++) {
            if (!daily[i].flag) continue;
            let j = i;
            while (j + 1 < daily.length && daily[j + 1].flag) j++;
            const grp = daily.slice(i, j + 1);
            const rooms_ = grp.reduce((a, x) => a + x.gap / 100 * CAP, 0);
            const willSell = grp.reduce((a, x) => a + x.expRooms, 0);
            const be = r => Math.max(1, Math.ceil(willSell * r / (1 - r)));
            alerts.push({
              from: grp[0].d, to: grp[grp.length - 1].d, days: grp.length,
              dows: grp.map(x => x.w), out: grp[0].out,
              basePct: Math.round(grp.reduce((a, x) => a + x.basePct, 0) / grp.length),
              expPct: Math.round(grp.reduce((a, x) => a + x.expPct, 0) / grp.length),
              booked: grp.reduce((a, x) => a + x.booked, 0),
              shortNow: Math.round(grp.reduce((a, x) => a + x.shortNow, 0) * 10) / 10,
              rooms: Math.round(rooms_ * 10) / 10,
              baht: Math.round(rooms_ * avgPrice),
              willSell: Math.round(willSell * 10) / 10,
              be10: be(0.10), be20: be(0.20), be30: be(0.30),
            });
            i = j;
          }
          alerts.sort((a, b) => b.baht - a.baht);

          /* จุดอ่อนเชิงโครงสร้าง: ช่องที่ต่ำเรื้อรัง — แก้ด้วยโปรรายวันไม่ขึ้น ต้องเปลี่ยนสินค้า/ตลาด */
          const weak = [];
          SEASONS.forEach((s0, si) => baseline[si].forEach((c, w) => {
            if (c.days >= MIN_DAYS && histN > 0) weak.push({ season: s0.label, si, w, pct: c.pct, days: c.days });
          }));
          weak.sort((a, b) => a.pct - b.pct);

          /* ── Pace: on the books สำหรับ 90 วันข้างหน้า เทียบ ณ จุดเดียวกันปีที่แล้ว
             ใช้ -364 วัน เพื่อให้วันในสัปดาห์ตรงกัน (52 สัปดาห์เป๊ะ) ── */
          const ly = addDaysStr(today, -364);
          const paceWin = asOf => {                        // คืนที่ "จองไว้แล้ว" ณ วันนั้น สำหรับ 90 วันถัดไป
            const end = addDaysStr(asOf, 90);
            let n = 0;
            for (const b of bs) {
              if (!roomSet.has(b.room)) continue;
              const cd = (b.created || '').slice(0, 10);
              if (!isDate(cd) || cd > asOf) continue;      // กฎเดียวกันทั้งสองฝั่ง = เทียบได้จริง
              let d = b.checkin > asOf ? b.checkin : asOf;
              while (d < b.checkout && d < end) { n++; d = addDaysStr(d, 1); }
            }
            return n;
          };
          const paceNow = paceWin(today), pacePrev = paceWin(ly);

          /* ── ยกเลิก (แถวยังอยู่ใน DB — soft delete) ── */
          const cxLead = [0,0,0,0,0,0];
          let cxNights = 0, cxRecent = 0, allRecent = 0;
          for (const b of cx) {
            cxNights += nightsOf(b);
            const ld = leadOf(b);
            if (ld >= 0) cxLead[leadBucket(ld)]++;
            if ((b.created || '').slice(0, 10) >= d365) cxRecent++;
          }
          for (const b of all) if ((b.created || '').slice(0, 10) >= d365) allRecent++;
          const cancelRate = all.length ? cx.length / all.length : 0;
          const cancelRecentPct = pct(cxRecent, allRecent);

          /* ── รายเดือน 15 เดือน + ห้อง + ลูกค้าซ้ำ ── */
          const ymList = Object.keys(months).sort().slice(-15);
          const monthRows = ymList.map(ym => {
            const [y, m] = ym.split('-').map(Number);
            const cap = new Date(Date.UTC(y, m, 0)).getUTCDate() * CAP;
            return { ym, nights: months[ym], cap, pct: pct(months[ym], cap) };
          });
          const roomRows = rooms.map(r => ({
            id: r.id, name: r.name, nights: perRoom[r.id] || 0, pct: pct(perRoom[r.id] || 0, 365),
          }));
          const repeatRows = Object.entries(repeat).filter(([, v]) => v.n >= 2)
            .sort((a, b) => b[1].n - a[1].n).slice(0, 12)
            .map(([ph, v]) => ({ phone: ph, n: v.n, name: v.name, last: v.last }));
          /* ── เดือนนี้: แยก "ผ่านไปแล้วจริง" ออกจาก "ทั้งเดือนรวมจองล่วงหน้า"
             เดิมเอาคืนทั้งเดือน ÷ ความจุเต็มเดือน ทำให้เดือนปัจจุบันดูต่ำเสมอ ── */
          const curYm = today.slice(0, 7);
          const cur = monthRows.find(x => x.ym === curYm);
          let mtdN = 0, mtdDays = 0;
          for (let d = curYm + '-01'; d.slice(0, 7) === curYm; d = addDaysStr(d, 1)) {
            if (d >= today) break;
            mtdN += perDay[d] || 0; mtdDays++;
          }


          /* ══ ช่องคำแนะนำ ═══════════════════════════════════════════════
             กฎตายตัวที่อ่านตัวเลขข้างบนแล้วแปลเป็นภาษาคน — ไม่ใช่คำทำนาย
             เงื่อนไขทุกข้อผูกกับตัวเลขจริง และแนบตัวเลขนั้นกลับไปให้ตรวจได้เสมอ
             เกณฑ์: sev 1 = ทำสัปดาห์นี้ / 2 = ทำเดือนนี้ / 3 = ข้อสังเกต ══ */
          const advice = [];
          const tip = (sev, tag, title, body, why) => advice.push({ sev, tag, title, body, why });
          const dowTH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'];
          const thb = n => Math.round(n).toLocaleString();

          // ช่องฐานที่ดีที่สุด/แย่ที่สุด (เฉพาะที่ข้อมูลพอ)
          const cells = [];
          SEASONS.forEach((s0, si) => baseline[si].forEach((c, w) => {
            if (c.days >= MIN_DAYS) cells.push({ si, w, pct: c.pct, days: c.days, label: s0.label });
          }));
          cells.sort((a, b) => b.pct - a.pct);
          const best = cells[0], worstCell = cells[cells.length - 1];

          // (1) มีวันที่ต่ำกว่าปกติไหม
          if (alerts.length) {
            const tot = alerts.reduce((a, x) => a + x.baht, 0);
            const a0 = alerts[0];
            tip(1, 'ทำสัปดาห์นี้', `มี ${alerts.length} ช่วงที่จองต่ำกว่าปกติ รวมราว ${thb(tot)} ฿`,
              `เริ่มจากช่วงที่เสียหายสูงสุดก่อน — ${a0.days > 1 ? 'ช่วง' : 'วัน'}ที่ใกล้ที่สุดเหลือ ${a0.out} วัน ` +
              `ถ้าจะลด 20% ต้องดึงเพิ่มให้ได้ ${a0.be20} หลังถึงคุ้ม ถ้าคิดว่าดึงไม่ถึงก็ไม่ต้องลด ` +
              `ลองเปลี่ยนเป็นเพิ่มของแถม (อาหารเช้า/เตียงเสริมฟรี) แทน เพราะต้นทุนต่ำกว่าการลดราคาห้อง`,
              `ห่างจากปกติ ${a0.shortNow} หลัง ณ ระยะเวลาเดียวกัน`);
          } else if (horizon > 0) {
            tip(3, 'ปกติดี', 'ตอนนี้ยังไม่ต้องลดราคาอะไร',
              `ทุกวันในระยะ ${horizon} วันข้างหน้าจองมาตามจังหวะปกติของวันแบบนั้น ` +
              `การลดราคาตอนที่ยอดปกติ = ทิ้งเงินฟรี`,
              `เทียบกับฐาน 2 ปีแล้วไม่มีวันไหนห่างเกิน 2 หลัง`);
          }

          // (2) เต็มบ่อย = ราคาต่ำกว่าที่ตลาดยอมจ่าย
          if (soldFull >= 10 && best) {
            tip(2, 'ราคา', `เต็มทุกหลัง ${soldFull} คืนในปีที่ผ่านมา — ราคายังไม่ชนเพดาน`,
              `วันที่ขายหมดคือวันที่คุณตั้งราคาต่ำไป ไม่ใช่วันที่ขายเก่ง ` +
              `ลองขึ้นราคา 10% เฉพาะ${dowTH[best.w]} ${best.label} ซึ่งเป็นช่องที่แน่นที่สุด (${best.pct}%) ` +
              `ทีละตัวแปรเดียว อย่าขึ้นทั้งกระดาน แล้วดู 6-8 สัปดาห์ว่าจำนวนคืนหายไหม ` +
              `ถ้าคืนหายน้อยกว่า 10% แปลว่าขึ้นได้อีก`,
              `เต็ม ${soldFull} คืน + ใกล้เต็มอีก ${soldNear} คืน จาก ${Math.round(histCap / CAP)} วันที่เปิดขาย`);
          }

          // (3) จุดอ่อนเรื้อรัง — ห้ามแก้ด้วยการลดราคา
          if (worstCell && histPct > 0 && worstCell.pct < histPct * 100 * 0.6) {
            tip(2, 'โครงสร้าง', `${dowTH[worstCell.w]}${worstCell.label} ขายไม่ออกเป็นนิสัย (${worstCell.pct}%)`,
              `ต่ำกว่าค่าเฉลี่ยรวม ${Math.round(histPct * 100)}% มาตลอด 2 ปี ไม่ใช่เรื่องบังเอิญของสัปดาห์ไหน ` +
              `ช่องแบบนี้ลดราคาก็ไม่มีคนมา เพราะคนกลุ่มเดิมเขาไม่ว่างมาวันนั้น ` +
              `ต้องเปลี่ยนกลุ่มลูกค้าแทน — แพ็กเกจพักยาว, ลูกค้าท้องถิ่น/ราชการ, กลุ่มสัมมนา, หรือใช้ช่วงนี้ปิดซ่อมบำรุงไปเลยจะคุ้มกว่า`,
              `มีข้อมูล ${worstCell.days} วัน จึงเชื่อได้`);
          }

          // (4) ยกเลิกกระจุกที่กลุ่มไหน
          const LEADLBL = ['วันเดียวกัน','1-3 วัน','4-7 วัน','8-14 วัน','15-30 วัน','เกิน 30 วัน'];
          let worstLead = -1, worstLeadRate = 0;
          for (let i = 0; i < 6; i++) {
            const tot = lead[i] + cxLead[i];
            if (tot < 20) continue;
            const rate = cxLead[i] / tot;
            if (rate > worstLeadRate) { worstLeadRate = rate; worstLead = i; }
          }
          if (worstLead >= 0 && cancelRate > 0 && worstLeadRate > cancelRate * 1.4) {
            tip(2, 'มัดจำ', `การยกเลิกกระจุกอยู่ที่คนจองล่วงหน้า${LEADLBL[worstLead]}`,
              `กลุ่มนี้ยกเลิก ${Math.round(worstLeadRate * 100)}% ขณะที่ค่าเฉลี่ยทั้งหมดอยู่ที่ ${Math.round(cancelRate * 100)}% ` +
              `ขึ้นมัดจำเฉพาะกลุ่มนี้กลุ่มเดียว ไม่ต้องขึ้นทั้งหมด — ` +
              `การขึ้นมัดจำกับกลุ่มที่ไม่เคยยกเลิกมีแต่จะไล่ลูกค้าดีๆ ออกไป`,
              `${cxLead[worstLead]} ครั้ง จาก ${lead[worstLead] + cxLead[worstLead]} รายการในกลุ่มนี้`);
          }

          // (5) จังหวะยิงโฆษณา — จากเส้นโค้งการจองจริง
          let l50 = 0;
          for (const p of pickup) if (p.ratio >= 0.5) l50 = p.lead;
          if (pkFinal > 100) {
            tip(3, 'โฆษณา', `ครึ่งหนึ่งของยอดจองเข้ามาภายใน ${l50} วันก่อนเข้าพัก`,
              `ยิงแอดล่วงหน้า 2-3 เดือนคือจ่ายเงินให้คนที่ยังไม่ตัดสินใจ ` +
              `จังหวะที่คุ้มที่สุดคือช่วง ${l50} ถึง ${l50 > 7 ? Math.round(l50 * 1.5) : 14} วันก่อนวันที่ต้องการเติม ` +
              `และเพราะคนที่นี่จองสั้น การเห็นวันว่างล่วงหน้า 60 วันแล้วตกใจจึงไม่มีประโยชน์`,
              `คำนวณจาก ${thb(pkFinal)} คืนขายจริง 2 ปี`);
          }

          // (6) ลูกค้าเก่า — ต้นทุนต่ำสุดที่มี
          const uniq = Object.keys(repeat).length;
          const rep = Object.values(repeat).filter(v => v.n >= 2).length;
          if (uniq >= 50) {
            const rr = Math.round(rep / uniq * 100);
            tip(3, 'ลูกค้าเก่า', `ลูกค้ากลับมาซ้ำ ${rr}% (${rep} จาก ${uniq} เบอร์)`,
              rr < 15
                ? `ต่ำ — แปลว่าเกือบทุกคืนที่ขายได้ต้องซื้อลูกค้าใหม่มาตลอด ซึ่งแพงที่สุด ` +
                  `ลองสิ่งที่ถูกที่สุดก่อน: ทัก LINE ลูกค้าที่เคยมาช่วงเดียวกันของปีที่แล้ว ก่อนถึงช่วงนั้น ${l50 || 14} วัน`
                : `ใช้ให้เป็นประโยชน์: ก่อนถึงช่วงที่อ่อน ทักลิสต์ VIP ข้างล่างก่อนลดราคาให้คนทั่วไป ` +
                  `เพราะคนกลุ่มนี้จองโดยไม่ต้องมีส่วนลดก็ได้`,
              `นับจากเบอร์ที่ตรงกัน ${uniq.toLocaleString()} เบอร์`);
          }

          // (7) ห้องที่ตามหลังคนอื่นมาก
          const rk = roomRows.filter(r => r.nights > 0).sort((a, b) => b.pct - a.pct);
          if (rk.length >= 4 && rk[0].pct > 0) {
            const lo = rk[rk.length - 1], hi = rk[0];
            if (lo.pct < hi.pct * 0.45) {
              tip(3, 'ห้อง', `${lo.name} ขายได้ ${lo.pct}% ขณะที่ ${hi.name} ได้ ${hi.pct}%`,
                `ห่างกันเกินครึ่ง มักไม่ใช่เพราะห้องแย่ แต่เพราะลูกค้าไม่เคยเห็น — ` +
                `ไล่เช็ค 3 อย่างตามลำดับ: รูปในเว็บ/เพจมีกี่รูปและสว่างไหม, มีหน้ารายละเอียดของตัวเองหรือยัง, ` +
                `แล้วค่อยดูราคาเป็นอย่างสุดท้าย`,
                `ต่างกัน ${hi.pct - lo.pct} จุด ใน 12 เดือน`);
            }
          }

          // (8) pace เทียบปีก่อน
          if (pacePrev >= 30) {
            const dp = Math.round((paceNow * (1 - cancelRate) - pacePrev) / pacePrev * 100);
            if (dp <= -10) tip(1, 'สัญญาณ', `ยอดจองล่วงหน้าต่ำกว่าปีที่แล้ว ${Math.abs(dp)}%`,
              `เทียบ ณ จุดเดียวกันของปีก่อนแล้ว ไม่ใช่เรื่องฤดูกาล — หาสาเหตุก่อนลดราคา ` +
              `เช็คว่าเพจ/รีวิวมีอะไรเปลี่ยน หรือมีที่พักใหม่เปิดแถวนั้นไหม การลดราคาแก้ปัญหาที่เกิดจากคู่แข่งไม่ได้`,
              `${paceNow} คืน (หักยกเลิกเหลือ ${Math.round(paceNow * (1 - cancelRate))}) เทียบ ${pacePrev} คืน`);
            else if (dp >= 10) tip(3, 'สัญญาณ', `ยอดจองล่วงหน้าสูงกว่าปีที่แล้ว ${dp}%`,
              `กำลังไปได้ดี — ช่วงนี้ควรทดลองขึ้นราคามากกว่าลด และอย่าเพิ่งรับส่วนลดกลุ่มใหญ่ไว้ล่วงหน้า`,
              `${paceNow} คืน เทียบ ${pacePrev} คืน ณ จุดเดียวกัน`);
          }

          // (9) ความยาวการพัก
          const stayTot = stay.reduce((a, b) => a + b, 0);
          if (stayTot >= 100 && stay[0] / stayTot > 0.7) {
            tip(3, 'แพ็กเกจ', `${Math.round(stay[0] / stayTot * 100)}% ของการจองพักแค่คืนเดียว`,
              `ในช่วงที่อ่อน การขายคืนที่สองถูกกว่าการหาลูกค้าใหม่หนึ่งคน เพราะเขามาอยู่แล้ว ` +
              `ลอง "คืนที่ 2 ลด 40%" เฉพาะวันธรรมดา แทนการลดราคาคืนแรก — ` +
              `แบบนี้ไม่กระทบราคาปกติที่ลูกค้ารับรู้`,
              `จาก ${stayTot.toLocaleString()} การจอง`);
          }

          advice.sort((a, b) => a.sev - b.sev);

          return json({ ok: true,
            months: monthRows, dow: dowRows, seasons: seasonRows, rooms: roomRows,
            lead, stay, repeat: repeatRows, forward: daily,
            alerts: alerts.slice(0, 8), weak: weak.slice(0, 4), horizon,
            advice: advice.slice(0, 6),
            baseline, seasonLabels: SEASONS.map(x => x.label),
            pickup: pickup.map(p => ({ lead: p.lead, pct: Math.round(p.ratio * 100) })),
            summary: {
              bookings: bs.length, totalNights, nights30, futureBookings,
              units: CAP, legacyNights, today, avgPrice,
              histPct: Math.round(histPct * 100), pkFinal,
              curPct: cur ? cur.pct : 0,
              curNights: cur ? cur.nights : 0, curCap: cur ? cur.cap : 0,
              mtdPct: pct(mtdN, mtdDays * CAP), mtdDays,
              f30: pct(f30, 30 * CAP), f60: pct(f60, 60 * CAP), f90: pct(f90, 90 * CAP),
              soldFull, soldNear, soldDates: soldDates.slice(-14).reverse(),
              paceNow, pacePrev, paceAdj: Math.round(paceNow * (1 - cancelRate)),
              cancels: cx.length, cancelPct: Math.round(cancelRate * 100),
              cancelRecentPct, cancelNights: cxNights, cancelLead: cxLead,
            } });
        }
        case 'export': {
          if (me.role !== 'admin') return json({ ok: false, error: 'เฉพาะ admin เท่านั้น' });
          const rooms = Object.fromEntries(
            (await env.DB.prepare('SELECT id,name FROM rooms').all()).results.map(r => [r.id, r.name]));
          const rows = (await env.DB.prepare(
            'SELECT id,room,checkin,checkout,name,phone,note,status,created,staff FROM bookings ORDER BY created,id').all()).results;
          const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
          const head = ['รหัส','ห้อง','ชื่อห้อง','เช็คอิน','เช็คเอาท์','ชื่อลูกค้า','เบอร์โทร','หมายเหตุ','สถานะ','วันที่จอง','ผู้รับจอง'];
          const csv = '\uFEFF' + head.join(',') + '\n' + rows.map(b =>
            [b.id, b.room, rooms[b.room] || b.room, b.checkin, b.checkout, b.name, b.phone, b.note, b.status, b.created, b.staff]
              .map(esc).join(',')).join('\n');
          return new Response(csv, { headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="thongwai-bookings.csv"',
            'access-control-allow-origin': '*' } });
        }
        // ── นำเข้าสมุดจองเดิม (admin, ทำซ้ำได้ ไม่ซ้ำแถว) ──
        case 'import': {
          // ถาวร (Pist 20 ส.ค. 2026): เดินทีละหน้า ไม่ผูกกับชุดข้อมูล — เปลี่ยน
          // tools/import-data.json เป็นชุดใหม่แล้ว deploy ก็นำเข้าซ้ำได้ (INSERT OR IGNORE)
          if (me.role !== 'admin') return json({ ok: false, error: 'เฉพาะ admin เท่านั้น' });
          const CHUNK = 300;
          const page = Math.max(0, Number(p.get('page') || 0));
          const batch = IMPORT_DATA.slice(page * CHUNK, (page + 1) * CHUNK);
          if (batch.length) {
            await env.DB.batch(batch.map(r => env.DB.prepare(
              `INSERT OR IGNORE INTO bookings (id,room,checkin,checkout,name,phone,note,status,created,staff)
               VALUES (?,?,?,?,?,?,?,?,?,?)`)
              .bind(r[0], r[1], r[2], r[3], r[4], r[5], r[6], 'จอง', r[7], r[8])));
          }
          const done = (page + 1) * CHUNK >= IMPORT_DATA.length;
          return json({ ok: true, total: IMPORT_DATA.length,
                        imported: Math.min((page + 1) * CHUNK, IMPORT_DATA.length), done, page });
        }
        // ── เฉพาะ admin ──
        case 'users': case 'user_add': case 'user_del': case 'user_setpw': {
          if (me.role !== 'admin') return json({ ok: false, error: 'เฉพาะ admin เท่านั้น' });
          if (action === 'users') {
            const users = (await env.DB.prepare('SELECT username, role, created FROM users ORDER BY role, username').all()).results;
            return json({ ok: true, users });
          }
          if (action === 'user_add')   return json(await userAdd(env.DB, p));
          if (action === 'user_del')   return json(await userDel(env.DB, p, me));
          if (action === 'user_setpw') return json(await userSetPw(env.DB, p));
        }
        default: return json({ ok: false, error: 'unknown action' });
      }
    } catch (err) {
      return json({ ok: false, error: String(err) });
    }
  },
};
