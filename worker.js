/**
 * ═══════════════════════════════════════════════════════════════
 * Thongwai Homestay — Booking API (Cloudflare Worker + D1)
 * แทนที่แผน Google Sheets/Apps Script — ทุกอย่างอยู่ในบัญชี Cloudflare เดียว
 * Endpoint: /api?action=...   (contract เดิมที่ /admin และหน้าแรกเรียกอยู่แล้ว)
 * ไฟล์นี้ถูกกันไม่ให้เสิร์ฟเป็นไฟล์สาธารณะด้วย .assetsignore (มี PIN ข้างใน)
 * ═══════════════════════════════════════════════════════════════
 */

const PIN = '2569';   // ★ รหัสทีมสำหรับหน้า /admin — เปลี่ยนได้ตามใจ แล้ว push ใหม่

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
  ['T1', 'เต็นท์กลางสนาม',       2,   600, 10],
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
  ]);
  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM rooms').first();
  if (c === 0) {
    await db.batch(SEED_ROOMS.map(r =>
      db.prepare('INSERT INTO rooms (id,name,capacity,price,sort) VALUES (?,?,?,?,?)').bind(...r)));
  }
  ready = true;
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
    `SELECT id,room,checkin,checkout,name,phone,note,status,created,staff FROM bookings
     WHERE checkin < ? AND checkout > ? ORDER BY checkin`).bind(to, from).all()).results;
  return { ok: true, bookings };
}

async function addBooking(db, p) {
  const room = p.get('room'), checkin = p.get('checkin'), checkout = p.get('checkout'),
        name = (p.get('name') || '').trim();
  if (!room || !name) return { ok: false, error: 'ข้อมูลไม่ครบ' };
  if (!isDate(checkin) || !isDate(checkout)) return { ok: false, error: 'รูปแบบวันที่ต้องเป็น yyyy-mm-dd' };
  if (checkout <= checkin) return { ok: false, error: 'วันเช็คเอาท์ต้องหลังวันเช็คอิน' };
  const r = await db.prepare('SELECT id FROM rooms WHERE id = ?').bind(room).first();
  if (!r) return { ok: false, error: 'ไม่พบห้อง ' + room };

  const id = 'B' + Date.now();
  // INSERT แบบมีเงื่อนไขในคำสั่งเดียว = atomic กันจองซ้อนแม้กดพร้อมกันสองเครื่อง
  const res = await db.prepare(
    `INSERT INTO bookings (id,room,checkin,checkout,name,phone,note,status,created,staff)
     SELECT ?,?,?,?,?,?,?,?,?,?
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE room = ? AND status = 'จอง' AND checkin < ? AND ? < checkout)`)
    .bind(id, room, checkin, checkout, name, p.get('phone') || '', p.get('note') || '',
          'จอง', nowStamp(), p.get('staff') || '',
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

/* ── router ── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api') return env.ASSETS.fetch(request);

    try {
      await init(env.DB);
      const p = url.searchParams;
      const action = p.get('action');
      if (action === 'availability') return json(await availability(env.DB, p));
      if (String(p.get('pin')) !== PIN) return json({ ok: false, error: 'PIN ไม่ถูกต้อง' });
      switch (action) {
        case 'rooms': {
          const rooms = (await env.DB.prepare('SELECT id,name,capacity,price FROM rooms ORDER BY sort').all()).results;
          return json({ ok: true, rooms });
        }
        case 'bookings': return json(await listBookings(env.DB, p));
        case 'add':      return json(await addBooking(env.DB, p));
        case 'cancel':   return json(await cancelBooking(env.DB, p));
        default:         return json({ ok: false, error: 'unknown action' });
      }
    } catch (err) {
      return json({ ok: false, error: String(err) });
    }
  },
};
