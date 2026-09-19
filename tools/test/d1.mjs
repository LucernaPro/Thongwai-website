// จำลอง D1 ด้วย sqlite ในเครื่อง เพื่อรัน worker.js ตัวจริงโดยไม่แก้โค้ดแม้แต่บรรทัดเดียว
import { DatabaseSync } from 'node:sqlite';

export function makeD1() {
  const db = new DatabaseSync(':memory:');

  const isSelect = q => /^\s*(select|pragma)/i.test(q);

  function stmt(sql) {
    let args = [];
    const api = {
      bind(...a) { args = a.map(v => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v))); return api; },
      async first() {
        const r = db.prepare(sql).get(...args);
        return r === undefined ? null : r;
      },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() {
        const r = db.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      _sql: sql, _args: () => args,
    };
    return api;
  }

  return {
    prepare: sql => stmt(sql),
    async batch(list) {
      const out = [];
      for (const s of list) out.push(isSelect(s._sql) ? await s.all() : await s.run());
      return out;
    },
    _raw: db,
  };
}

export function makeEnv() {
  const slips = new Map();
  return {
    DB: makeD1(),
    SLIPS: {
      async put(key, buf) { slips.set(key, buf); return { key }; },
      async get(key) { return slips.has(key) ? { body: slips.get(key) } : null; },
    },
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    PROMPTPAY_ID: '0812345678',
    _slips: slips,
  };
}
