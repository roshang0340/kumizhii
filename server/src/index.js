import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
BigInt.prototype.toJSON = function () {
  return Number(this);
};

const app = express();
const PORT = Number(process.env.PORT || 4000);
const isVercel = Boolean(process.env.VERCEL);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = isVercel ? "/tmp" : path.resolve(__dirname, "../uploads");
if (!isVercel) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
app.use("/uploads", express.static(uploadDir));

app.use((_req, _res, next) => {
  initDb().then(() => next()).catch((err) => {
    console.error("DB Init Error:", err);
    next();
  });
});

async function adminOnly(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!token || !clientId || !adminEmail) {
      return res.status(401).json({ error: "Admin sign-in is not configured." });
    }
    const oauth = new OAuth2Client(clientId);
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(403).json({ error: "This Google account is not the configured admin." });
    }
    req.adminEmail = payload.email;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired Google sign-in. Please sign in again." });
  }
}

const postFields = "id, title, content, type, image_url, audio_url, status, publish_date, created_at, updated_at";

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/posts/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await db.execute({
      sql: `SELECT ${postFields} FROM posts WHERE status='published' AND publish_date <= ? ORDER BY publish_date DESC, id DESC LIMIT 1`,
      args: [today]
    });
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch today's post." });
  }
});

app.get("/api/posts/archive", async (_req, res) => {
  try {
    const result = await db.execute(`SELECT ${postFields} FROM posts WHERE status='published' ORDER BY publish_date DESC, id DESC`);
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch archive." });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    const postId = Number(req.body?.postId) || null;
    if (message.length < 2) return res.status(400).json({ error: "Please enter a little feedback." });
    await db.execute({
      sql: "INSERT INTO feedback(name, message, post_id) VALUES (?, ?, ?)",
      args: [name || null, message, postId]
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to submit feedback." });
  }
});

app.get("/api/admin/settings", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT value FROM settings WHERE key='ai_enabled'");
    res.json({ aiEnabled: result.rows[0]?.value === "true" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch settings." });
  }
});

app.put("/api/admin/settings", adminOnly, async (req, res) => {
  try {
    const enabled = Boolean(req.body?.aiEnabled);
    await db.execute({
      sql: "INSERT INTO settings(key,value) VALUES('ai_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      args: [String(enabled)]
    });
    res.json({ aiEnabled: enabled });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update settings." });
  }
});

app.get("/api/admin/posts", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute(`SELECT ${postFields} FROM posts ORDER BY COALESCE(publish_date, created_at) DESC, id DESC`);
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch admin posts." });
  }
});

app.get("/api/admin/feedback", adminOnly, async (_req, res) => {
  try {
    const result = await db.execute("SELECT feedback.*, posts.title AS post_title FROM feedback LEFT JOIN posts ON posts.id=feedback.post_id ORDER BY feedback.id DESC");
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch feedback." });
  }
});

const storage = isVercel ? multer.memoryStorage() : multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype))
});
const uploadAudio = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^audio\/(mpeg|mp3|wav|ogg|aac|mp4|x-m4a|webm)$/i.test(file.mimetype) || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.originalname))
});

app.post("/api/admin/upload", adminOnly, upload.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose a JPG, PNG, WEBP, or GIF image under 8 MB." });
    if (isVercel && req.file.buffer) {
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      return res.status(201).json({ imageUrl: base64 });
    }
    res.status(201).json({ imageUrl: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to upload image." });
  }
});

app.post("/api/admin/upload-audio", adminOnly, uploadAudio.single("audio"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose an MP3, WAV, M4A, AAC, or OGG audio file under 25 MB." });
    if (isVercel && req.file.buffer) {
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      return res.status(201).json({ audioUrl: base64 });
    }
    res.status(201).json({ audioUrl: `/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to upload audio." });
  }
});

app.post("/api/admin/posts", adminOnly, async (req, res) => {
  try {
    const { title, content, type = "Thought", imageUrl = "", audioUrl = "", publishDate = "" } = req.body || {};
    if (!String(title || "").trim() || !String(content || "").trim()) return res.status(400).json({ error: "Title and content are required." });
    const result = await db.execute({
      sql: "INSERT INTO posts(title,content,type,image_url,audio_url,status,publish_date) VALUES(?,?,?,?,?, 'draft', ?)",
      args: [String(title).trim(), String(content).trim(), String(type), String(imageUrl), String(audioUrl), publishDate || null]
    });
    const created = await db.execute({ sql: `SELECT ${postFields} FROM posts WHERE id=?`, args: [Number(result.lastInsertRowid)] });
    res.status(201).json(created.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create post." });
  }
});

app.put("/api/admin/posts/:id", adminOnly, async (req, res) => {
  try {
    const { title, content, type = "Thought", imageUrl = "", audioUrl = "", publishDate = "" } = req.body || {};
    if (!String(title || "").trim() || !String(content || "").trim()) return res.status(400).json({ error: "Title and content are required." });
    const result = await db.execute({
      sql: "UPDATE posts SET title=?,content=?,type=?,image_url=?,audio_url=?,publish_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      args: [String(title).trim(), String(content).trim(), String(type), String(imageUrl), String(audioUrl), publishDate || null, Number(req.params.id)]
    });
    if (!result.rowsAffected) return res.status(404).json({ error: "Post not found." });
    const updated = await db.execute({ sql: `SELECT ${postFields} FROM posts WHERE id=?`, args: [Number(req.params.id)] });
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update post." });
  }
});

app.post("/api/admin/posts/:id/publish", adminOnly, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "UPDATE posts SET status='published', publish_date=COALESCE(publish_date, date('now')), updated_at=CURRENT_TIMESTAMP WHERE id=?",
      args: [Number(req.params.id)]
    });
    if (!result.rowsAffected) return res.status(404).json({ error: "Post not found." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to publish post." });
  }
});

app.post("/api/admin/posts/:id/unpublish", adminOnly, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "UPDATE posts SET status='draft', updated_at=CURRENT_TIMESTAMP WHERE id=?",
      args: [Number(req.params.id)]
    });
    if (!result.rowsAffected) return res.status(404).json({ error: "Post not found." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to unpublish post." });
  }
});

app.delete("/api/admin/posts/:id", adminOnly, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "DELETE FROM posts WHERE id=?",
      args: [Number(req.params.id)]
    });
    if (!result.rowsAffected) return res.status(404).json({ error: "Post not found." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete post." });
  }
});

app.post("/api/admin/generate", adminOnly, async (req, res) => {
  try {
    const setting = await db.execute("SELECT value FROM settings WHERE key='ai_enabled'");
    const enabled = setting.rows[0]?.value === "true";
    if (!enabled) return res.status(403).json({ error: "AI is OFF. Turn it on in Admin settings to generate content." });
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.CHAT_GEMINI_API_KEY;
    if (!openaiKey && !geminiKey) return res.status(503).json({ error: "Add OPENAI_API_KEY or GEMINI_API_KEY to Vercel Environment Variables." });
    const idea = String(req.body?.idea || "").trim();
    const type = String(req.body?.type || "Thought");
    if (!idea) return res.status(400).json({ error: "Enter a short idea first." });
    const prompt = `Write an original, natural-sounding Tamil ${type.toLowerCase()} for a daily journal based on this idea: ${idea}. Avoid clichés. Return only a short title on the first line, then the content.`;
    
    let text = "";
    if (openaiKey) {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.7 })
      });
      const data = await response.json();
      if (!response.ok) return res.status(502).json({ error: data.error?.message || "OpenAI request failed." });
      text = data.choices?.[0]?.message?.content?.trim() || "";
    } else {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (!response.ok) return res.status(502).json({ error: data.error?.message || "Gemini request failed." });
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
    }
    const newline = text.indexOf("\n");
    res.json({ title: newline > 0 ? text.slice(0, newline).replace(/^#+\s*/, "").replace(/[*_]/g, "") : "இன்றைய சிந்தனை", content: newline > 0 ? text.slice(newline + 1).trim() : text });
  } catch (err) {
    res.status(502).json({ error: err.message || "Could not reach AI provider. You can still write the post manually." });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled express error:", err);
  res.status(500).json({ error: err?.message || "Internal server error." });
});

if (!isVercel) {
  app.listen(PORT, () => console.log(`Daily Journal API running on http://localhost:${PORT}`));
}

export default app;
