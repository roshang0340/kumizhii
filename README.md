# Daily Journal — Full-stack starter

A premium two-tone daily story / poem / thought website.

## Stack
- React + Vite frontend
- Node.js + Express backend
- SQLite (`better-sqlite3`)
- Google OAuth sign-in for the admin (restricted by `ADMIN_EMAIL`)
- Optional Gemini text generation (only called when AI is enabled and admin clicks Generate)
- Manual background image upload
- Public daily post + archive + feedback form
- Admin create/edit/preview/publish/unpublish and feedback inbox

## Requirements
- Node.js 20+
- Google OAuth Web Client ID (for admin sign-in)
- Optional Gemini API key

## Setup

### 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Set `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, and optionally `GEMINI_API_KEY` in `server/.env`.

### 2. Frontend
In another terminal:
```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Notes
- SQLite data is stored in `server/data/app.db`.
- Uploaded images are stored in `server/uploads/`.
- For deployment, use a host with persistent disk storage, or move SQLite/uploads to persistent storage.
- Configure Google OAuth authorized JavaScript origin to your frontend URL.
- This starter uses Google Identity Services ID-token verification on the backend.
- Keep secrets only in `server/.env`; never put API keys in frontend environment variables.
- The app is a starter and should be reviewed, tested, and configured before production deployment.
