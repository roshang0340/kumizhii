import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);
const memoryFilePath = isVercel
  ? "/tmp/kumizhii_db.json"
  : path.resolve(here, "../data/kumizhii_db.json");

class MemoryDb {
  constructor() {
    this.posts = [];
    this.feedback = [];
    this.settings = new Map([["ai_enabled", "false"]]);
    this.nextPostId = 1;
    this.nextFeedbackId = 1;
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(memoryFilePath)) {
        const raw = fs.readFileSync(memoryFilePath, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.posts)) this.posts = data.posts;
        if (Array.isArray(data.feedback)) this.feedback = data.feedback;
        if (data.settings && typeof data.settings === "object") {
          for (const [k, v] of Object.entries(data.settings)) {
            this.settings.set(k, String(v));
          }
        }
        if (typeof data.nextPostId === "number") this.nextPostId = data.nextPostId;
        if (typeof data.nextFeedbackId === "number") this.nextFeedbackId = data.nextFeedbackId;
      }
    } catch (e) {
      console.error("Failed to load memory db file:", e);
    }
  }

  saveToFile() {
    try {
      const data = {
        posts: this.posts,
        feedback: this.feedback,
        settings: Object.fromEntries(this.settings.entries()),
        nextPostId: this.nextPostId,
        nextFeedbackId: this.nextFeedbackId
      };
      fs.writeFileSync(memoryFilePath, JSON.stringify(data), "utf-8");
    } catch (e) {
      console.error("Failed to save memory db file:", e);
    }
  }

  async execute(input) {
    const sql = typeof input === "string" ? input : input.sql;
    const args = (typeof input === "object" && input.args) || [];
    const normalized = sql.trim().toLowerCase();

    if (normalized.startsWith("create table") || normalized.startsWith("alter table") || normalized.startsWith("insert or ignore into settings")) {
      return { rows: [], rowsAffected: 0, lastInsertRowid: 0n };
    }

    if (normalized.includes("from settings")) {
      const val = this.settings.get("ai_enabled") || "false";
      return { rows: [{ value: val }], rowsAffected: 0 };
    }

    if (normalized.includes("into settings") || normalized.includes("settings")) {
      if (args.length > 0) this.settings.set("ai_enabled", String(args[0]));
      this.saveToFile();
      return { rows: [], rowsAffected: 1 };
    }

    if (normalized.includes("from posts") && normalized.includes("limit 1")) {
      const published = this.posts
        .filter(p => p.status === "published")
        .sort((a, b) => (b.publish_date || b.created_at).localeCompare(a.publish_date || a.created_at) || b.id - a.id);
      return { rows: published[0] ? [published[0]] : [], rowsAffected: 0 };
    }

    if (normalized.includes("from posts") && normalized.includes("status='published'")) {
      const published = this.posts
        .filter(p => p.status === "published")
        .sort((a, b) => (b.publish_date || b.created_at).localeCompare(a.publish_date || a.created_at) || b.id - a.id);
      return { rows: published, rowsAffected: 0 };
    }

    if (normalized.includes("from posts") && !normalized.includes("where id=")) {
      const sorted = [...this.posts].sort((a, b) => (b.publish_date || b.created_at).localeCompare(a.publish_date || a.created_at) || b.id - a.id);
      return { rows: sorted, rowsAffected: 0 };
    }

    if (normalized.includes("from posts where id=")) {
      const targetId = Number(args[0]);
      const found = this.posts.find(p => p.id === targetId);
      return { rows: found ? [found] : [], rowsAffected: 0 };
    }

    if (normalized.startsWith("insert into posts")) {
      const [title, content, type, image_url, audio_url, publish_date] = args;
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const newPost = {
        id: this.nextPostId++,
        title: String(title || ""),
        content: String(content || ""),
        type: String(type || "Thought"),
        image_url: String(image_url || ""),
        audio_url: String(audio_url || ""),
        status: "draft",
        publish_date: publish_date || now.slice(0, 10),
        created_at: now,
        updated_at: now
      };
      this.posts.push(newPost);
      this.saveToFile();
      return { rows: [], rowsAffected: 1, lastInsertRowid: BigInt(newPost.id) };
    }

    if (normalized.startsWith("update posts")) {
      if (normalized.includes("status='published'")) {
        const id = Number(args[0]);
        const post = this.posts.find(p => p.id === id);
        if (post) {
          post.status = "published";
          if (!post.publish_date) post.publish_date = new Date().toISOString().slice(0, 10);
          post.updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
          this.saveToFile();
          return { rows: [], rowsAffected: 1 };
        }
        return { rows: [], rowsAffected: 0 };
      }
      if (normalized.includes("status='draft'")) {
        const id = Number(args[0]);
        const post = this.posts.find(p => p.id === id);
        if (post) {
          post.status = "draft";
          post.updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
          this.saveToFile();
          return { rows: [], rowsAffected: 1 };
        }
        return { rows: [], rowsAffected: 0 };
      }
      const [title, content, type, image_url, audio_url, publish_date, id] = args;
      const post = this.posts.find(p => p.id === Number(id));
      if (post) {
        post.title = String(title || "");
        post.content = String(content || "");
        post.type = String(type || "Thought");
        post.image_url = String(image_url || "");
        post.audio_url = String(audio_url || "");
        if (publish_date) post.publish_date = publish_date;
        post.updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
        this.saveToFile();
        return { rows: [], rowsAffected: 1 };
      }
      return { rows: [], rowsAffected: 0 };
    }

    if (normalized.startsWith("delete from posts")) {
      const id = Number(args[0]);
      const idx = this.posts.findIndex(p => p.id === id);
      if (idx !== -1) {
        this.posts.splice(idx, 1);
        this.saveToFile();
        return { rows: [], rowsAffected: 1 };
      }
      return { rows: [], rowsAffected: 0 };
    }

    if (normalized.startsWith("insert into feedback")) {
      const [name, message, post_id] = args;
      const newFb = {
        id: this.nextFeedbackId++,
        name: name || null,
        message: String(message || ""),
        post_id: post_id || null,
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19)
      };
      this.feedback.push(newFb);
      this.saveToFile();
      return { rows: [], rowsAffected: 1, lastInsertRowid: BigInt(newFb.id) };
    }

    if (normalized.includes("from feedback")) {
      const result = this.feedback.map(f => {
        const post = this.posts.find(p => p.id === f.post_id);
        return { ...f, post_title: post ? post.title : null };
      }).sort((a, b) => b.id - a.id);
      return { rows: result, rowsAffected: 0 };
    }

    return { rows: [], rowsAffected: 0 };
  }
}

class SafeDbClient {
  constructor() {
    this.memoryDb = new MemoryDb();
    this.primaryDb = null;
    this.initPrimary();
  }

  initPrimary() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (url) {
      try {
        this.primaryDb = createClient({ url, authToken: authToken || undefined });
      } catch (e) {
        console.error("Failed to initialize Turso client, falling back to MemoryDb:", e);
      }
    } else if (!isVercel) {
      try {
        const dataDir = path.resolve(here, "../data");
        fs.mkdirSync(dataDir, { recursive: true });
        this.primaryDb = createClient({ url: `file:${path.resolve(here, "../data/app.db")}` });
      } catch (e) {
        console.error("Failed to initialize local sqlite, falling back to MemoryDb:", e);
      }
    }
  }

  async execute(input) {
    if (this.primaryDb) {
      try {
        return await this.primaryDb.execute(input);
      } catch (err) {
        console.error("Primary DB execute error, falling back to MemoryDb:", err);
      }
    }
    return await this.memoryDb.execute(input);
  }
}

export const db = new SafeDbClient();

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

    isInitialized = true;
  } catch (err) {
    console.error("Failed to initialize database tables:", err);
  }
}
