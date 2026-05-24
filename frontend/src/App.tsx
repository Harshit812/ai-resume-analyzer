import { useState, useRef } from "react";
import "./App.css";

interface AnalysisResult {
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  improvements: string[];
  tailoredSummary: string;
}

type Status = "idle" | "loading" | "done" | "error";

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !jobDescription.trim()) return;

    setStatus("loading");
    setResult(null);
    setError("");
    setStreamText("");

    const resumeBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeBase64, jobDescription }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            setStreamText((prev) => prev + data.text);
          } else if (data.type === "done") {
            setResult(data.result);
            setStatus("done");
          } else if (data.type === "error") {
            setError(data.message);
            setStatus("error");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="app">
      <header>
        <h1>AI Resume Analyzer</h1>
        <p>Upload your resume and paste a job description to get an ATS match score and tailored feedback — powered by Claude AI.</p>
      </header>

      <main>
        <form onSubmit={handleSubmit} className="form-card">
          <div className="field">
            <label>Resume (PDF)</label>
            <div
              className={`drop-zone ${file ? "has-file" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped?.type === "application/pdf") setFile(dropped);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <span className="file-name">📄 {file.name}</span>
              ) : (
                <span>Drop PDF here or <u>click to browse</u></span>
              )}
            </div>
          </div>

          <div className="field">
            <label>Job Description</label>
            <textarea
              placeholder="Paste the full job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={10}
            />
          </div>

          <button type="submit" disabled={!file || !jobDescription.trim() || status === "loading"}>
            {status === "loading" ? "Analyzing…" : "Analyze Match"}
          </button>
        </form>

        {status === "loading" && (
          <div className="loading-card">
            <div className="spinner" />
            <p>Claude is analyzing your resume…</p>
            {streamText && <pre className="stream-preview">{streamText}</pre>}
          </div>
        )}

        {status === "error" && (
          <div className="error-card">
            <strong>Error:</strong> {error}
          </div>
        )}

        {status === "done" && result && (
          <div className="results">
            <div className="score-card">
              <div
                className="score-circle"
                style={{ borderColor: scoreColor(result.matchScore), color: scoreColor(result.matchScore) }}
              >
                <span className="score-number">{result.matchScore}</span>
                <span className="score-label">/ 100</span>
              </div>
              <div className="score-meta">
                <h2>ATS Match Score</h2>
                <p>
                  {result.matchScore >= 75
                    ? "Strong match — you're well-positioned for this role."
                    : result.matchScore >= 50
                    ? "Moderate match — a few targeted tweaks will help."
                    : "Low match — significant gaps to address before applying."}
                </p>
              </div>
            </div>

            <div className="two-col">
              <div className="keyword-card">
                <h3>Matched Keywords ({result.matchedKeywords.length})</h3>
                <div className="tags">
                  {result.matchedKeywords.map((k) => (
                    <span key={k} className="tag tag-green">{k}</span>
                  ))}
                </div>
              </div>
              <div className="keyword-card">
                <h3>Missing Keywords ({result.missingKeywords.length})</h3>
                <div className="tags">
                  {result.missingKeywords.map((k) => (
                    <span key={k} className="tag tag-red">{k}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="two-col">
              <div className="list-card">
                <h3>Strengths</h3>
                <ul>
                  {result.strengths.map((s, i) => (
                    <li key={i}>✓ {s}</li>
                  ))}
                </ul>
              </div>
              <div className="list-card">
                <h3>Improvements</h3>
                <ul>
                  {result.improvements.map((s, i) => (
                    <li key={i}>→ {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="summary-card">
              <h3>Tailored Professional Summary</h3>
              <p>{result.tailoredSummary}</p>
              <button
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(result.tailoredSummary)}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
