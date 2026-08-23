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
    `SELECT id,room,checkin,checkout,name,phone,note,status,created,staff FROM bookings
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

/* ── router ── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api') return env.ASSETS.fetch(request);

    try {
      await init(env.DB);
      const p = url.searchParams;
      const action = p.get('action');
      if (action === 'availability') return json(await availability(env.DB, p));

      const me = await auth(env.DB, p);
      if (!me) return json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

      switch (action) {
        case 'login': return json({ ok: true, user: me.username, role: me.role });
        case 'rooms': {
          const rooms = (await env.DB.prepare('SELECT id,name,capacity,price FROM rooms ORDER BY sort').all()).results;
          return json({ ok: true, rooms });
        }
        case 'bookings': return json(await listBookings(env.DB, p));
        case 'booked_on': {
          const dt = p.get('date');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dt || '')) return json({ ok: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' });
          const bookings = (await env.DB.prepare(
            `SELECT id,room,checkin,checkout,name,phone,note,status,created,staff FROM bookings
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
          const rooms = (await env.DB.prepare('SELECT id,name,sort FROM rooms ORDER BY sort').all()).results;
          const all = (await env.DB.prepare(
            'SELECT room,checkin,checkout,created,phone,name,status FROM bookings').all()).results;
          const roomSet = new Set(rooms.map(r => r.id));
          const CAP = rooms.length || 1;
          const today = todayStr();
          const d365 = addDaysStr(today, -365), d30 = addDaysStr(today, -30);
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
          let totalNights = 0, futureBookings = 0, legacyNights = 0;
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
                perDay[d] = (perDay[d] || 0) + 1;
                months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + 1;
                if (d >= d365) perRoom[b.room] = (perRoom[b.room] || 0) + 1;
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
          const dowN = [0,0,0,0,0,0,0], dowCap = [0,0,0,0,0,0,0];
          const seasonN = SEASONS.map(() => [0,0,0,0,0,0,0]);
          const seasonCap = SEASONS.map(() => [0,0,0,0,0,0,0]);
          const soldDates = [];
          let soldFull = 0, soldNear = 0, nights30 = 0;
          for (let d = d365; d < today; d = addDaysStr(d, 1)) {
            const n = perDay[d] || 0, w = N(d).getUTCDay(), mo = Number(d.slice(5, 7));
            dowN[w] += n; dowCap[w] += CAP;
            const si = SEASONS.findIndex(s => s.m.includes(mo));
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

          return json({ ok: true,
            months: monthRows, dow: dowRows, seasons: seasonRows, rooms: roomRows,
            lead, stay, repeat: repeatRows, forward,
            summary: {
              bookings: bs.length, totalNights, nights30, futureBookings,
              units: CAP, legacyNights, today,
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
