import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'dankali.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', reseller INTEGER NOT NULL DEFAULT 0,
  wallet INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bundles(
  id INTEGER PRIMARY KEY, company TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
  price INTEGER NOT NULL, validity TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, bundle_id INTEGER, company TEXT NOT NULL,
  category TEXT NOT NULL, bundle_name TEXT NOT NULL, target_phone TEXT NOT NULL, base INTEGER NOT NULL,
  price INTEGER NOT NULL, method TEXT NOT NULL, payer_phone TEXT, tx_ref TEXT, status TEXT NOT NULL,
  note TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
CREATE TABLE IF NOT EXISTS topups(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL,
  payer_phone TEXT, tx_ref TEXT, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, type TEXT NOT NULL, ref TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS float(company TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS float_log(id INTEGER PRIMARY KEY, company TEXT NOT NULL, usd REAL NOT NULL, kind TEXT NOT NULL, note TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments_in(
  id INTEGER PRIMARY KEY, method TEXT NOT NULL, tx_ref TEXT NOT NULL, amount INTEGER NOT NULL, payer TEXT, raw TEXT,
  matched_type TEXT, matched_id INTEGER, source TEXT NOT NULL DEFAULT 'webhook', created INTEGER NOT NULL, UNIQUE(method, tx_ref));
CREATE TABLE IF NOT EXISTS merchant_ledger(id INTEGER PRIMARY KEY, method TEXT NOT NULL, usd REAL NOT NULL, kind TEXT NOT NULL, note TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ads(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, url TEXT, image TEXT, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
`);

const prep = (s) => db.prepare(s);
export const get = (s, ...p) => prep(s).get(...p);
export const all = (s, ...p) => prep(s).all(...p);
export const run = (s, ...p) => prep(s).run(...p);
let depth = 0;
export function tx(fn) {
  if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
  db.exec('BEGIN IMMEDIATE');
  depth = 1;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth = 0; }
}
export function getSetting(key, def) {
  const r = get('SELECT value FROM settings WHERE key=?', key);
  if (!r) return def;
  try { return JSON.parse(r.value); } catch { return def; }
}
export function setSetting(key, val) {
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(val));
}

// ---- Xogta bilowga ah (marka database-ku madhan yahay) ----
export const COMPANIES = { somtel: 'Somtel', telesom: 'Telesom', soltelco: 'Soltelco' };
export function seed() {
  for (const c of Object.keys(COMPANIES)) run('INSERT OR IGNORE INTO float(company,usd) VALUES(?,0)', c);
  if (get('SELECT COUNT(*) n FROM bundles').n === 0) {
    const U = 'Unlimited Data & Voice', C = 'Casri Bundle';
    const rows = [
      ['somtel', U, 'Unlimited 24 Saac', 5490, '24 saac'], ['somtel', U, 'Unlimited 2 Maalin', 11490, '2 maalin'],
      ['somtel', U, 'Unlimited 7 Maalin', 34940, '7 maalin'],
      ['somtel', C, '500MB', 1418, '1 toddobaad'], ['somtel', C, '1GB', 2959, '1 toddobaad'],
      ['somtel', C, '2GB', 5946, '1 toddobaad'], ['somtel', C, '4GB', 11492, '1 toddobaad'],
      ['somtel', 'Muraad', 'Unlimited Voice', 38400, '1 bil'],
      ['telesom', 'Kaafiye Voice', 'Unlimited Voice 24 Saac', 3428, '24 saac'],
      ['telesom', 'Kaafiye Voice', 'Unlimited Voice 7 Maalin', 22800, '7 maalin'],
      ['telesom', 'Kaafiye Voice', 'Unlimited Voice 14 Maalin', 45800, '14 maalin'],
      ['telesom', 'Kaafiye Voice', 'Unlimited Voice 30 Maalin', 79900, '30 maalin'],
      ['telesom', C, '25GB', 56800, '30 maalin'],
      ['soltelco', U, 'Unlimited 30 Saac', 5490, '30 saac'],
    ];
    rows.forEach((r, i) => run('INSERT INTO bundles(company,category,name,price,validity,sort) VALUES(?,?,?,?,?,?)', ...r, i));
  }
  const defaults = {
    rate: 5750, bonus: 17, float_thr: 30, restock_usd: 100, reseller_discount: 5, user_orders: '1', auto_deliver: '0', auto_restock: '0', auto_convert: '0', convert_usd: 30, sms_auto_max: 60000, sms_rules: {}, sms_senders: {},
    social: { tiktok: '', instagram: '', facebook: '', youtube: '', telegram: '' },
  };
  for (const [k, v] of Object.entries(defaults)) if (!get('SELECT 1 FROM settings WHERE key=?', k)) setSetting(k, v);
  if (!get("SELECT 1 FROM settings WHERE key='whatsapp'")) setSetting('whatsapp', (process.env.WHATSAPP || '').replace(/\D/g, ''));
  if (!get("SELECT 1 FROM settings WHERE key='payments'")) {
    const p = {};
    for (const part of (process.env.PAYMENTS || '').split(',')) {
      const i = part.indexOf(':');
      if (i > 0) p[part.slice(0, i).trim()] = part.slice(i + 1).replace(/\D/g, '');
    }
    if (!Object.keys(p).length) Object.assign(p, { 'EVC Plus': '', Zaad: '', 'eDahab (Somtel)': '', Soltelco: '' });
    setSetting('payments', p);
  }
}
