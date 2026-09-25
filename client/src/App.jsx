import React, { useEffect, useMemo, useState } from "react";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { ArrowDown, ArrowLeft, ArrowUpRight, CalendarDays, Feather, Headphones, ImagePlus, LogOut, MessageCircle, PenLine, Sparkles, Upload, Volume2, X } from "lucide-react";

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes("localhost")) return envUrl;
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "";
  }
  return envUrl || "http://localhost:4000";
};
const API = getApiUrl();
const today = new Date().toISOString().slice(0, 10);
const fmt = (d) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Unscheduled";
const resolveImg = (url) => url ? (url.startsWith("http") || url.startsWith("//") || url.startsWith("data:") ? url : `${API}${url}`) : "";

function App() {
  const [page, setPage] = useState("home");
  const [post, setPost] = useState(null);
  const [archive, setArchive] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [posts, setPosts] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("Thought");
  const [publishDate, setPublishDate] = useState(today);
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);

  const headers = useMemo(() => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token]);
  async function api(path, options = {}) {
    const r = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }
  async function loadPublic() {
    try { setPost(await api("/api/posts/today")); setArchive(await api("/api/posts/archive")); } catch { setPost(null); }
  }
  async function loadAdmin(t = token) {
    if (!t) return;
    try {
      const h = { Authorization: `Bearer ${t}` };
      const [p, s, f] = await Promise.all([
        fetch(`${API}/api/admin/posts`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/admin/settings`, { headers: h }).then(r => r.json()),
        fetch(`${API}/api/admin/feedback`, { headers: h }).then(r => r.json())
      ]);
      if (Array.isArray(p)) setPosts(p);
      if (typeof s.aiEnabled === "boolean") setAiEnabled(s.aiEnabled);
      if (Array.isArray(f)) setFeedback(f);
    } catch (e) { setNotice(e.message); }
  }
  useEffect(() => { loadPublic(); }, []);
  useEffect(() => { if (token) loadAdmin(token); }, [token]);

  function startNew() {
    setEditing(null); setTitle(""); setContent(""); setType("Thought"); setPublishDate(today); setImageUrl(""); setAudioUrl(""); setIdea("");
  }
  function edit(p) {
    setEditing(p.id); setTitle(p.title); setContent(p.content); setType(p.type); setPublishDate(p.publish_date || today); setImageUrl(p.image_url || ""); setAudioUrl(p.audio_url || ""); setPage("editor");
  }
  async function save(publish = false) {
    setBusy(true); setNotice("");
    try {
      const body = { title, content, type, publishDate, imageUrl, audioUrl };
      const p = editing
        ? await api(`/api/admin/posts/${editing}`, { method: "PUT", body: JSON.stringify(body) })
        : await api("/api/admin/posts", { method: "POST", body: JSON.stringify(body) });
      if (publish) await api(`/api/admin/posts/${p.id}/publish`, { method: "POST" });
      setNotice(publish ? "Published successfully." : "Draft saved.");
      await loadAdmin(); await loadPublic(); setPage("admin");
    } catch (e) { setNotice(e.message); }
    finally { setBusy(false); }
  }
  async function uploadImage(file) {
    if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Upload failed.");
      setImageUrl(`${API}${data.imageUrl}`); setNotice("Background uploaded.");
    } catch (e) { setNotice(e.message); }
    finally { setBusy(false); }
  }
  async function uploadAudio(file) {
    if (!file) return;
    const fd = new FormData(); fd.append("audio", file);
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/upload-audio`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Audio upload failed.");
      setAudioUrl(`${API}${data.audioUrl}`); setNotice("Voice recitation / audio uploaded.");
    } catch (e) { setNotice(e.message); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setNotice("");
    try {
      const result = await api("/api/admin/generate", { method: "POST", body: JSON.stringify({ idea, type }) });
      setTitle(result.title); setContent(result.content); setNotice("AI draft generated. Review and edit before publishing.");
    } catch (e) { setNotice(e.message); }
    finally { setBusy(false); }
  }
  async function sendFeedback(e) {
    e.preventDefault(); setNotice("");
    try {
      await api("/api/feedback", { method: "POST", body: JSON.stringify({ name, message, postId: post?.id }) });
      setMessage(""); setName(""); setNotice("Thank you — your note has been received.");
    } catch (e) { setNotice(e.message); }
  }
  async function toggleAI(value) {
    try { const s = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ aiEnabled: value }) }); setAiEnabled(s.aiEnabled); }
    catch (e) { setNotice(e.message); }
  }
  async function publishToggle(p) {
    try {
      await api(`/api/admin/posts/${p.id}/${p.status === "published" ? "unpublish" : "publish"}`, { method: "POST" });
      await loadAdmin(); await loadPublic();
    } catch (e) { setNotice(e.message); }
  }
  async function deletePost(p) {
    if (!window.confirm(`Delete "${p.title}" permanently?`)) return;
    try {
      await api(`/api/admin/posts/${p.id}`, { method: "DELETE" });
      setNotice("Entry deleted.");
      await loadAdmin(); await loadPublic();
    } catch (e) { setNotice(e.message); }
  }

  const isAdmin = ["admin", "editor", "feedback"].includes(page);
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")}>
          <img
            src="/logo.png"
            alt="Logo"
            className="brand-logo"
            onError={(e) => {
              const formats = ["/logo.png", "/logo.jpg", "/logo.jpeg", "/logo.webp", "/logo.svg"];
              const idx = Number(e.target.getAttribute("data-idx") || 0) + 1;
              if (idx < formats.length) {
                e.target.setAttribute("data-idx", idx);
                e.target.src = formats[idx];
              } else {
                e.target.style.display = "none";
                if (e.target.nextSibling) e.target.nextSibling.style.display = "grid";
              }
            }}
          />
          <span className="brand-mark" style={{ display: "none" }}><Feather size={17}/></span>
          <span>நாளொரு வரி<small>A DAILY JOURNAL</small></span>
        </button>
        <nav><button onClick={() => { setPage("home"); loadPublic(); }}>Today</button><button onClick={() => setPage("archive")}>Archive</button><button className="admin-link" onClick={() => setPage(token ? "admin" : "login")}>Admin <ArrowUpRight size={14}/></button></nav>
      </header>

      {page === "home" && <main>
        <section className="hero">
          <div className="hero-glow"></div>
          <div className="eyebrow"><span className="live-dot"></span> A LITTLE SOMETHING FOR TODAY</div>
          <div className="hero-copy">
            <p className="date"><CalendarDays size={14}/> {fmt(post?.publish_date || today).toUpperCase()}</p>
            <h1>{post?.title || "ஒவ்வொரு நாளுக்கும்\nஒரு சிறிய உணர்வு."}</h1>
            <p className="hero-desc">{post?.content || "ஒரு கதை, ஒரு கவிதை, ஒரு சிந்தனை — நாளை கொஞ்சம் அழகாக்கும் ஒரு வரி."}</p>
            {post?.audio_url && (
              <div className="audio-player-box">
                <span className="audio-label"><Headphones size={15}/> குரல் பதிவு / Listen to audio</span>
                <audio controls src={resolveImg(post.audio_url)} className="styled-audio-player" />
              </div>
            )}
            <button className="text-button" onClick={() => document.getElementById("reader-note")?.scrollIntoView({ behavior: "smooth" })}>Leave a note <ArrowDown size={16}/></button>
          </div>
          <div className="hero-image" style={{ backgroundImage: `linear-gradient(90deg,rgba(17,27,50,.15),rgba(17,27,50,.05)),url("${resolveImg(post?.image_url || "/archive-illustration.jpeg")}")` }} />
          <div className="hero-index">01 <span>/ THE DAILY PAGE</span></div>
        </section>
        <section className="note-section" id="reader-note">
          <div><p className="eyebrow dark">A NOTE FROM YOU</p><h2>What stayed with you?</h2><p className="muted">A thought, a feeling, or just a few words. We'd love to read it.</p></div>
          <form className="feedback-form" onSubmit={sendFeedback}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" maxLength={80}/>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your note…" required maxLength={2000}/>
            <button className="primary-button" disabled={!message.trim()}>Send note <ArrowUpRight size={16}/></button>
          </form>
        </section>
        <section className="archive-teaser"><div><p className="eyebrow dark">THE DAYS BEFORE</p><h2>Some things are worth revisiting.</h2></div><button className="outline-button" onClick={() => setPage("archive")}>Explore archive <ArrowUpRight size={16}/></button></section>
      </main>}

      {page === "archive" && <main className="inner-page archive-page">
        <div className="archive-header">
          <div>
            <p className="eyebrow dark">THE ARCHIVE</p>
            <h1 className="page-title">A collection of<br/>days gone by.</h1>
            <p className="muted">கடந்த நாட்களின் நினைவுகளும் சிந்தனைகளும்.</p>
          </div>
          <img
            src="/archive-illustration.jpg"
            alt="Archive Illustration"
            className="archive-art"
            onError={(e) => {
              const formats = ["/archive-illustration.jpg", "/archive-illustration.jpeg", "/archive-illustration.png", "/archive-illustration.webp"];
              const idx = Number(e.target.getAttribute("data-idx") || 0) + 1;
              if (idx < formats.length) {
                e.target.setAttribute("data-idx", idx);
                e.target.src = formats[idx];
              } else {
                e.target.style.display = "none";
              }
            }}
          />
        </div>
        <div className="archive-grid">{archive.map((p, i) => <button className="archive-card" key={p.id} onClick={() => { setPost(p); setPage("read"); }}><span className="card-number">{String(i+1).padStart(2,"0")}</span><span className="card-type">{p.type} · {fmt(p.publish_date)} {p.audio_url ? "🎧" : ""}</span><strong>{p.title}</strong><span className="card-excerpt">{p.content.slice(0,130)}{p.content.length>130?"…":""}</span><ArrowUpRight size={18}/></button>)}{!archive.length && <p className="muted">The archive is waiting for its first entry.</p>}</div>
      </main>}
      {page === "read" && <main className="inner-page read-page">
        <button className="back-button" onClick={() => setPage("archive")}><ArrowLeft size={16}/> Back to archive</button>
        <p className="eyebrow dark">{post?.type} · {fmt(post?.publish_date)}</p>
        <h1 className="page-title">{post?.title}</h1>
        {post?.audio_url && (
          <div className="audio-player-box dark">
            <span className="audio-label"><Headphones size={15}/> குரல் பதிவு / Listen to audio</span>
            <audio controls src={resolveImg(post.audio_url)} className="styled-audio-player" />
          </div>
        )}
        <article className="reader-content">{post?.content}</article>
        <img className="reader-image" src={resolveImg(post?.image_url || "/archive-illustration.jpeg")} alt="Post background"/>
      </main>}

      {page === "login" && <main className="login-page"><div className="login-card">
        <img
          src="/logo.png"
          alt="Logo"
          className="login-card-logo"
          onError={(e) => {
            const formats = ["/logo.png", "/logo.jpg", "/logo.jpeg", "/logo.webp", "/logo.svg"];
            const idx = Number(e.target.getAttribute("data-idx") || 0) + 1;
            if (idx < formats.length) {
              e.target.setAttribute("data-idx", idx);
              e.target.src = formats[idx];
            } else {
              e.target.style.display = "none";
              if (e.target.nextSibling) e.target.nextSibling.style.display = "grid";
            }
          }}
        />
        <span className="brand-mark" style={{ display: "none" }}><Feather/></span>
        <p className="eyebrow dark">THE PRIVATE SIDE</p><h1>Welcome back.</h1><p className="muted">Sign in with the Google account configured as the admin.</p><GoogleLogin onSuccess={c => { setToken(c.credential); setNotice("Signed in."); setPage("admin"); }} onError={() => setNotice("Google sign-in failed.")}/>{notice && <p className="notice">{notice}</p>}</div></main>}

      {isAdmin && <main className="admin-page">
        <div className="admin-heading"><div><p className="eyebrow dark">CONTROL ROOM</p><h1>{page === "editor" ? (editing ? "Edit entry." : "Create something.") : page === "feedback" ? "Reader notes." : "Your journal."}</h1></div><button className="outline-button" onClick={() => { googleLogout(); setToken(""); setPage("home"); }}><LogOut size={15}/> Sign out</button></div>
        {notice && <p className="notice">{notice}</p>}
        {page === "admin" && <>
          <div className="settings-strip"><div><Sparkles size={18}/><div><strong>AI writing assistant</strong><small>Only called when you explicitly generate a draft.</small></div></div><button className={`toggle ${aiEnabled ? "on" : ""}`} onClick={() => toggleAI(!aiEnabled)} aria-label="Toggle AI"><span/></button><b>{aiEnabled ? "ON" : "OFF"}</b></div>
          <div className="admin-actions"><button className="primary-button" onClick={() => { startNew(); setPage("editor"); }}><PenLine size={16}/> New entry</button><button className="outline-button" onClick={() => setPage("feedback")}><MessageCircle size={16}/> Reader notes ({feedback.length})</button></div>
          <div className="post-table">{posts.map(p => <div className="post-row" key={p.id}><div><span className={`status ${p.status}`}>{p.status}</span><strong>{p.title} {p.audio_url ? "🎧" : ""}</strong><small>{p.type} · {fmt(p.publish_date)}</small></div><button onClick={() => edit(p)}>Edit</button><button onClick={() => publishToggle(p)}>{p.status === "published" ? "Unpublish" : "Publish"}</button><button className="danger-button" onClick={() => deletePost(p)}>Delete</button></div>)}{!posts.length && <p className="muted">No entries yet. Create your first one.</p>}</div>
        </>}
        {page === "editor" && <div className="editor-layout">
          <section className="editor-form">
            <label>Content type<select value={type} onChange={e => setType(e.target.value)}><option>Thought</option><option>Poem</option><option>Story</option><option>Information</option></select></label>
            <label>Short idea for AI (optional)<input value={idea} onChange={e => setIdea(e.target.value)} placeholder="e.g. learning to let go"/></label>
            <button className="outline-button" disabled={!aiEnabled || !idea.trim() || busy} onClick={generate}><Sparkles size={16}/> Generate draft</button>
            <label>Title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this entry a title" required/></label>
            <label>Your content<textarea className="content-input" value={content} onChange={e => setContent(e.target.value)} placeholder="Write something worth keeping…" required/></label>
            <label>Publish date<input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)}/></label>
            <label className="upload-box"><Upload size={17}/> Upload background image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => uploadImage(e.target.files?.[0])}/><small>JPG, PNG, WEBP or GIF · up to 8 MB</small></label>
            {imageUrl && <div className="image-preview"><img src={resolveImg(imageUrl)} alt="Selected background"/><button onClick={() => setImageUrl("")}><X size={15}/> Remove</button></div>}
            <label className="upload-box"><Headphones size={17}/> Upload voice recitation / audio<input type="file" accept="audio/*" onChange={e => uploadAudio(e.target.files?.[0])}/><small>MP3, WAV, M4A, AAC or OGG · up to 25 MB</small></label>
            {audioUrl && <div className="image-preview audio-preview-box"><audio controls src={resolveImg(audioUrl)} /><button onClick={() => setAudioUrl("")}><X size={15}/> Remove audio</button></div>}
            <div className="editor-buttons"><button className="outline-button" disabled={busy} onClick={() => save(false)}>Save draft</button><button className="primary-button" disabled={busy || !title.trim() || !content.trim()} onClick={() => save(true)}>Publish entry <ArrowUpRight size={16}/></button></div>
          </section>
          <aside className="preview-panel"><p className="eyebrow dark">LIVE PREVIEW</p><div className="preview-card" style={{ backgroundImage: `linear-gradient(180deg,rgba(17,27,50,.35),rgba(17,27,50,.92)),url("${resolveImg(imageUrl || "/archive-illustration.jpeg")}")` }}><span>{type} · {fmt(publishDate)} {audioUrl ? "🎧" : ""}</span><h2>{title || "Your title goes here"}</h2><p>{content || "Your writing will appear here, just as readers will see it."}</p></div></aside>
        </div>}
        {page === "feedback" && <div className="feedback-list">{feedback.map(f => <article className="feedback-item" key={f.id}><p>{f.message}</p><small>{f.name || "Anonymous"} · {f.post_title || "General"} · {f.created_at}</small></article>)}{!feedback.length && <p className="muted">No reader notes yet.</p>}<button className="outline-button" onClick={() => setPage("admin")}>Back to dashboard</button></div>}
      </main>}

      <footer><span>நாளொரு வரி</span><span className="footer-tag">குமிழி ✨❤️</span><span>© {new Date().getFullYear()}</span></footer>
      {notice && page !== "login" && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}><X size={14}/></button></div>}
    </div>
  );
}
export default App;
