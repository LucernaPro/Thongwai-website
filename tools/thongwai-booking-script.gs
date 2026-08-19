/**
 * ═══════════════════════════════════════════════════════════════
 * Thongwai Homestay — Booking API (Google Apps Script)
 * Sheet = database / Script นี้ = API ฟรี ไม่มีเซิร์ฟเวอร์
 * ═══════════════════════════════════════════════════════════════
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. สร้าง Google Sheet ชื่อ "Thongwai Booking"
 * 2. Extensions → Apps Script → ลบโค้ดเดิม วางไฟล์นี้ทั้งไฟล์
 * 3. แก้ PIN ด้านล่างเป็นรหัสของเราเอง (ตัวเลข 4-6 หลักก็ได้)
 * 4. เลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์ครั้งแรก) — สร้างตารางให้เอง
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me / Who has access: Anyone
 * 6. ก๊อป URL ที่ลงท้าย /exec ไปวางใน:
 *    - หน้า /admin (ช่องตั้งค่าครั้งแรก)
 *    - ตัวแปร BOOKING_API ท้ายไฟล์ index.html ของเว็บ
 * ⚠️ วันเปิดใช้: คีย์การจองเก่าจากปฏิทินทีมเข้าระบบก่อน กันจองซ้อน
 */

const PIN = 'CHANGE_ME';                 // ★ เปลี่ยนก่อน Deploy
const TZ  = 'Asia/Vientiane';
const SHEET_ROOMS    = 'Rooms';
const SHEET_BOOKINGS = 'Bookings';

// เฮือน 9 หลัง + เต็นท์ (ราคา = ไม่รวมอาหารเช้า ตามหน้าเว็บ)
const SEED_ROOMS = [
  ['R1', 'เฮือนมหาเศรษฐี',      6,  2300],
  ['R2', 'เฮือนโชคลาภเงินทอง',  4,  1600],
  ['R3', 'เฮือนเจ้าสัว 1',       4,  1800],
  ['R4', 'เฮือนเจ้าสัว 2',       4,  1800],
  ['R5', 'เฮือนมั่งมีเงินทอง',   2,   800],
  ['R6', 'เฮือนล้ำลวย',          2,   800],
  ['R7', 'เฮือนอุดมสุข',         4,  1600],
  ['R8', 'เฮือนมั่งคั่ง',       10,  3000],
  ['R9', 'เฮือนมหาเฮง',         10,  3000],
  ['T1', 'เต็นท์กลางสนาม',       2,   600],
];

const BOOKING_HEADERS = ['id','ห้อง','เช็คอิน','เช็คเอาท์','ชื่อลูกค้า','โทร','โน้ต','สถานะ','บันทึกเมื่อ','บันทึกโดย'];

/* ═══ รันครั้งเดียวตอนติดตั้ง ═══ */
function setup() {
  const ss = SpreadsheetApp.getActive();
  let r = ss.getSheetByName(SHEET_ROOMS);
  if (!r) {
    r = ss.insertSheet(SHEET_ROOMS);
    r.getRange(1, 1, 1, 4).setValues([['id','ชื่อ','จำนวนคน','ราคา/คืน']]).setFontWeight('bold');
    r.getRange(2, 1, SEED_ROOMS.length, 4).setValues(SEED_ROOMS);
    r.setFrozenRows(1);
  }
  let b = ss.getSheetByName(SHEET_BOOKINGS);
  if (!b) {
    b = ss.insertSheet(SHEET_BOOKINGS);
    b.getRange(1, 1, 1, BOOKING_HEADERS.length).setValues([BOOKING_HEADERS]).setFontWeight('bold');
    b.setFrozenRows(1);
    // บังคับคอลัมน์วันที่เป็น text กัน Sheets แปลงรูปแบบเอง
    b.getRange('C:D').setNumberFormat('@');
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 2) ss.deleteSheet(def);
}

/* ═══ Router ═══ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'availability': return out(availability(p));            // สาธารณะ — ไม่มีชื่อลูกค้า
      case 'rooms':        return out(auth(p, () => ({ ok: true, rooms: readRooms() })));
      case 'bookings':     return out(auth(p, () => listBookings(p)));
      case 'add':          return out(auth(p, () => addBooking(p)));
      case 'cancel':       return out(auth(p, () => cancelBooking(p)));
      default:             return out({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function auth(p, fn) {
  if (String(p.pin) !== String(PIN)) return { ok: false, error: 'PIN ไม่ถูกต้อง' };
  return fn();
}

/* ═══ Helpers ═══ */
function fmt(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function todayStr() { return fmt(new Date()); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return fmt(d); }
function readRooms() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ROOMS);
  return sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), 4).getValues()
    .filter(r => r[0])
    .map(r => ({ id: String(r[0]), name: String(r[1]), capacity: Number(r[2]), price: Number(r[3]) }));
}
function readBookings() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_BOOKINGS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, BOOKING_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2,
    id: String(r[0]), room: String(r[1]),
    checkin: String(r[2]), checkout: String(r[3]),
    name: String(r[4]), phone: String(r[5]), note: String(r[6]),
    status: String(r[7]), created: String(r[8]), staff: String(r[9]),
  })).filter(b => b.id);
}

/* ═══ actions ═══ */
// สาธารณะ: คืนห้อง + คืนที่ถูกจองต่อห้อง (ไม่มีข้อมูลลูกค้า)
function availability(p) {
  const from = p.from || todayStr();
  const days = Math.min(Number(p.days) || 30, 120);
  const to = addDays(from, days);
  const booked = {};
  readBookings().forEach(b => {
    if (b.status !== 'จอง') return;
    if (b.checkout <= from || b.checkin >= to) return;
    booked[b.room] = booked[b.room] || [];
    for (let d = b.checkin < from ? from : b.checkin; d < b.checkout && d < to; d = addDays(d, 1)) {
      booked[b.room].push(d);
    }
  });
  return { ok: true, from, to, rooms: readRooms().map(r => ({ id: r.id, name: r.name })), booked };
}

// admin: รายการจองช่วงวันที่ (มีชื่อ — ต้องมี PIN)
function listBookings(p) {
  const from = p.from || addDays(todayStr(), -60);
  const to = p.to || addDays(todayStr(), 120);
  const bookings = readBookings()
    .filter(b => !(b.checkout <= from || b.checkin >= to))
    .map(({ row, ...b }) => b);
  return { ok: true, bookings };
}

// admin: เพิ่มการจอง — LockService กันกดพร้อมกันสองเครื่องแล้วจองซ้อน
function addBooking(p) {
  if (!p.room || !p.checkin || !p.checkout || !p.name) return { ok: false, error: 'ข้อมูลไม่ครบ' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(p.checkout))
    return { ok: false, error: 'รูปแบบวันที่ต้องเป็น yyyy-mm-dd' };
  if (p.checkout <= p.checkin) return { ok: false, error: 'วันเช็คเอาท์ต้องหลังวันเช็คอิน' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const clash = readBookings().find(b =>
      b.room === p.room && b.status === 'จอง' &&
      p.checkin < b.checkout && b.checkin < p.checkout);
    if (clash) return { ok: false, error: 'ห้องนี้ถูกจองแล้วช่วง ' + clash.checkin + ' → ' + clash.checkout };

    const id = 'B' + Date.now();
    const created = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    SpreadsheetApp.getActive().getSheetByName(SHEET_BOOKINGS).appendRow([
      id, p.room, p.checkin, p.checkout,
      p.name, p.phone || '', p.note || '', 'จอง', created, p.staff || '',
    ]);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

// admin: ยกเลิก (เปลี่ยนสถานะ ไม่ลบแถว — เก็บประวัติ)
function cancelBooking(p) {
  const b = readBookings().find(x => x.id === String(p.id));
  if (!b) return { ok: false, error: 'ไม่พบการจอง ' + p.id };
  SpreadsheetApp.getActive().getSheetByName(SHEET_BOOKINGS).getRange(b.row, 8).setValue('ยกเลิก');
  return { ok: true };
}
