import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export const dataDir = resolve(process.env.DATA_DIR || "./data");
mkdirSync(join(dataDir, "uploads"), { recursive: true });
export const db = new DatabaseSync(join(dataDir, "aspirants.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS terms(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, parent TEXT NOT NULL DEFAULT '', UNIQUE(kind,name));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
`);
export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
export function checkPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    return timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}
export function setPassword(password) {
  if (password.length < 12) throw Error("Use at least 12 characters.");
  db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
    "admin_password",
    hashPassword(password),
  );
  db.exec("DELETE FROM sessions");
}
if (process.env.ADMIN_PASSWORD) {
  const current = db
    .prepare("SELECT value FROM settings WHERE key='admin_password'")
    .get();
  if (!current) setPassword(process.env.ADMIN_PASSWORD);
}
export const allItems = () =>
  db
    .prepare("SELECT data,created_at,updated_at FROM items ORDER BY rowid")
    .all()
    .map((r) => ({
      ...JSON.parse(r.data),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
export function registerTerms(item) {
  for (const [kind, values] of Object.entries({
    category: item.categories,
    subcategory: item.subcategories,
    creator: item.creators,
    genre: item.genres,
    tag: item.tags,
  })) {
    for (const name of values || [])
      db.prepare(
        "INSERT OR IGNORE INTO terms(kind,name,parent) VALUES (?,?,?)",
      ).run(kind, name, kind === "subcategory" ? item.categories[0] || "" : "");
  }
}
export function saveItem(item) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO items VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
  ).run(item.id, JSON.stringify(item), now, now);
  registerTerms(item);
  return item;
}
if (!db.prepare("SELECT value FROM settings WHERE key='seeded'").get()) {
  const items = JSON.parse(
    readFileSync(new URL("./seed/items.json", import.meta.url), "utf8"),
  );
  db.exec("BEGIN");
  try {
    for (const item of items) saveItem(item);
    db.prepare("INSERT INTO settings VALUES (?,?)").run("seeded", "1");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
