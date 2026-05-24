import type { VercelRequest, VercelResponse } from "@vercel/node";
import pdfParse from "pdf-parse";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { resumeBase64, jobDescription } = req.body as {
    resumeBase64?: string;
    jobDescription?: string;
  };

  if (!resumeBase64 || !jobDescription?.trim()) {
    res.status(400).json({ error: "resumeBase64 and jobDescription are required" });
    return;
  }

  try {
    const buffer = Buffer.from(resumeBase64, "base64");
    const { text: resumeText } = await pdfParse(buffer);

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
    const analysis = JSON.parse(cleaned);
    res.write(`data: ${JSON.stringify({ type: "done", result: analysis })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    res.end();
  }
}
