# AI Resume Analyzer

**Live demo: [ai-resume-analyzer-gilt-phi.vercel.app](https://ai-resume-analyzer-gilt-phi.vercel.app/)**

An AI-powered tool that analyzes your resume against a job description, gives you an ATS match score, highlights keyword gaps, and generates a tailored professional summary — all streamed in real time.

![AI Resume Analyzer](frontend/src/assets/hero.png)

---

## What it does

1. **Upload your resume** (PDF) via drag-and-drop or file picker
2. **Paste a job description** into the text area
3. Hit **Analyze Match** — the AI streams its analysis live as it runs
4. Get back:
   - **ATS Match Score** (0–100) with color-coded feedback
   - **Matched Keywords** — skills and terms already in your resume
   - **Missing Keywords** — important JD terms absent from your resume
   - **Strengths** — 3–5 specific points where your resume aligns well
   - **Improvements** — 3–5 actionable suggestions to close the gap
   - **Tailored Professional Summary** — a rewritten 3-sentence summary optimized for the role, with a one-click copy button

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Custom CSS (no UI library) |
| PDF parsing | `pdf-parse` |
| AI model | Llama 3.3 70B Versatile via Groq API |
| Streaming | Server-Sent Events (SSE) |
| Backend | Vercel Serverless Function (`api/analyze.ts`) |
| Deployment | Vercel |

---

## Project structure

```
ai-resume-analyzer/
├── frontend/                   # Vercel root — React app + serverless API
│   ├── api/
│   │   └── analyze.ts          # Vercel serverless function — PDF parse + Groq SSE stream
│   ├── src/
│   │   ├── App.tsx             # Main UI — form, streaming display, results
│   │   ├── App.css             # All styles
│   │   └── main.tsx            # React entry point
│   ├── public/
│   │   └── favicon.svg
│   ├── vercel.json             # Routing + function config
│   ├── vite.config.ts
│   └── package.json
└── backend/                    # Standalone Express server (local dev alternative)
    └── src/
        └── index.ts            # Express + multer + Groq SSE — same logic, multipart upload
```

---

## How it works

```
Browser                     Vercel Edge / Serverless
  |                                  |
  |-- POST /api/analyze ------------>|
  |   { resumeBase64, jobDesc }      |
  |                                  |-- pdf-parse extracts resume text
  |                                  |-- Groq streams Llama 3.3 70B response
  |<-- SSE: { type: "delta", text } -|  (tokens arrive in real time)
  |<-- SSE: { type: "done", result } |  (parsed JSON on completion)
```

The serverless function:
1. Decodes the base64 PDF and extracts plain text with `pdf-parse`
2. Sends a structured prompt to Groq's `llama-3.3-70b-versatile` with `stream: true`
3. Forwards each token delta to the browser as an SSE event
4. On stream completion, parses the accumulated JSON and emits a final `done` event with the full structured result

---

## Express backend (local alternative)

The `backend/` folder contains a standalone Express server that mirrors the Vercel function's logic. It uses `multer` for multipart file uploads instead of base64, making it useful for local development without the Vercel CLI.

```bash
cd backend
npm install
# add GROQ_API_KEY to backend/.env
npx ts-node src/index.ts   # runs on http://localhost:3001
```

The production deployment uses the Vercel serverless function in `frontend/api/`.

---

## Getting started locally

### Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com/) (free tier available)

### Install & run

```bash
cd frontend
npm install
```

Create a `frontend/.env.local` file:

```
GROQ_API_KEY=your_groq_api_key_here
```

Run the dev server (Vercel CLI handles the serverless function locally):

```bash
npx vercel dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Deployment

This project is configured for zero-config deployment on Vercel. The `frontend/` directory is the Vercel root.

```bash
vercel --prod
```

Set the `GROQ_API_KEY` environment variable in your Vercel project settings.

The `vercel.json` routes all non-API traffic to `index.html` (SPA fallback) and sets a 30-second timeout on the analyze function to handle longer resumes.

---

## Environment variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Your Groq API key — used server-side only, never exposed to the browser |
