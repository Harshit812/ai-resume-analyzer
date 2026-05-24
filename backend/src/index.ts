import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

interface AnalysisResult {
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  improvements: string[];
  tailoredSummary: string;
}

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) analyzer and career coach.
Analyze the provided resume against the job description and return a JSON object with this exact structure:
{
  "matchScore": <number 0-100>,
  "matchedKeywords": [<keywords from JD found in resume>],
  "missingKeywords": [<important keywords from JD missing in resume>],
  "strengths": [<3-5 specific strengths from the resume that match the role>],
  "improvements": [<3-5 specific, actionable improvements to better match the JD>],
  "tailoredSummary": "<a rewritten 3-sentence professional summary optimized for this specific role>"
}
Return only valid JSON, no markdown fences, no explanation.`;

app.post("/api/analyze", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Resume PDF is required" });
      return;
    }
    const jobDescription = req.body.jobDescription as string;
    if (!jobDescription?.trim()) {
      res.status(400).json({ error: "Job description is required" });
      return;
    }

    const { text: resumeText } = await pdfParse(req.file.buffer);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullText = "";

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      stream: true,
      max_tokens: 2048,
      temperature: 0.3,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) {
        fullText += text;
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
    }

    const cleaned = fullText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const analysis: AnalysisResult = JSON.parse(cleaned);
    res.write(`data: ${JSON.stringify({ type: "done", result: analysis })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    res.end();
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
