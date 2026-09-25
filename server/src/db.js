import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

const localDbPath = isVercel
  ? "file:/tmp/app.db"
  : `file:${path.resolve(here, "../data/app.db")}`;

if (!tursoUrl && !isVercel) {
  const dataDir = path.resolve(here, "../data");
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = createClient({
  url: tursoUrl || localDbPath,
  authToken: tursoToken || undefined,
});

let isInitialized = false;

export async function initDb() {
  if (isInitialized) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'Thought',
        image_url TEXT,
        audio_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        publish_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        message TEXT NOT NULL,
        post_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(post_id) REFERENCES posts(id)
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);

    await db.execute(`
      INSERT OR IGNORE INTO settings(key, value) VALUES ('ai_enabled', 'false');
    `);

    try {
      await db.execute("ALTER TABLE posts ADD COLUMN audio_url TEXT");
    } catch {}

    isInitialized = true;
  } catch (err) {
    console.error("Failed to initialize database tables:", err);
  }
}
