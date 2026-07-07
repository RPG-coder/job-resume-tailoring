import React, { useState } from "react";
import { Job } from "../../../interfaces/global";
import { generateContent } from "../../../util/transformer";

interface JobDetailsViewProps {
  job: Job;
  onBack: () => void;
}

export const JobDetailsView: React.FC<JobDetailsViewProps> = ({
  job,
  onBack,
}) => {
  const [isResumeGenerating, setIsResumeGenerating] = useState<boolean>(false);
  const [isCoverLetterGenerating, setIsCoverLetterGenerating] =
    useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const handleGenerateCoverLetter = async () => {
    setIsCoverLetterGenerating(true);
    setStatusMsg("✍️ Drafting cover letter...");

    try {
      const storage = await chrome.storage.local.get(["masterDocumentText"]);
      const masterText = storage.masterDocumentText;

      // 1. Generate via Gemini
      const prompt = `Write a brutal, high-impact cover letter for ${job.title} at ${job.company}. 
    Focus on business value and specific achievements. Max 250 words. No fluff. 
    Master Doc: ${masterText}`;

      const response = await generateContent(prompt);

      // 2. Transmit to Factory
      const finalPayload = {
        type: "coverLetter", // This flag directs GAS to the simple append logic
        docName: `Cover_Letter_${job.company.replace(/\s+/g, "_")}`,
        resumeData: response,
      };

      const fetchResponse = await fetch(process.env.REACT_APP_WEBAPPURL!, {
        method: "POST",
        body: JSON.stringify(finalPayload),
      });

      const result = await fetchResponse.json();
      if (!result.success) throw new Error(result.error);

      window.open(result.url, "_blank");
      setStatusMsg("✅ Success! Cover letter ready.");
    } catch (error) {
      console.error("❌ Cover Letter Error:", error);
      setStatusMsg("❌ Error generating cover letter.");
    } finally {
      setIsCoverLetterGenerating(false);
    }
  };

  const handleGenerateResume = async () => {
    console.log("🚀 START: handleGenerateResume triggered");
    setIsResumeGenerating(true);
    setStatusMsg("🚀 Initializing Pipeline...");

    try {
      const storage = await chrome.storage.local.get(["masterDocumentText"]);
      const masterText = storage.masterDocumentText as string[];
      if (!masterText) throw new Error("Master Document missing.");
      console.log(
        "✅ DATA: Master document retrieved, length:",
        masterText.length,
      );

      // 1. SINGLE AI CALL: Only for tailored sections
      setStatusMsg(
        "🧠 Tailoring Experience & Projects with Gemini AI Studio...",
      );
      console.log("🤖 CALLING: Ollama API...");

      const prompt = `
SYSTEM INSTRUCTION: You are an uncompromising, brutal executive recruiter and resume auditor. Your goal is to maximize the candidate's impact against the Job Description.

TASK:
1. Audit the Master Doc against the Job Requirements: ${job.title} at ${job.company}.
2. Rewrite all bullet points to be impact-oriented, metrics-driven (STAR method), and aggressive.
3. Provide a brief "Brutal Critique" section (50 words max) followed by the JSON block.
4. A line can have only at max 105 character
REQUIRED JSON FORMAT (Strictly adhered):
{
  "title": "${process.env.REACT_APP_RESUMENAME}",
  "subtitle": ["${process.env.REACT_APP_RESUMEADDRESS} | ${process.env.REACT_APP_RESUMEEMAIL} | +1 ${process.env.REACT_APP_RESUMEPHONE}", "${process.env.REACT_APP_RESUMELINKEDIN} | ${process.env.REACT_APP_RESUMEGITHUB}"],
  "sections": [
    { "type": "summary", "title": "Summary", "content": "Ruthlessly optimized summary highlighting AI expertise. Keep it 3-4 lines (sentances). combine to single paragraph." },
    { "type": "bullet-points", "title": "Technical Skills", "content": [{ "labelName": "AI & Data:", "content": "Generative AI, RAG, Vector Search, LLM Observability" }] },
    { "type": "sub-section", "title": "Professional Experience", "content": [
      { "title": ["Job Title - Company, City, <State if-US or Country if-not-US> | Start Date - End Date"], "type": "bullet-points", "content": ["...optimized bullet 1...", "...optimized bullet 2..."] }
    ]},
    { "type": "sub-section", "title": "Projects", "content": [
      { "title": ["Project Name <optional: "- Hackathon/Event Name"> | Date"], "type": "bullet-points", "content": ["...optimized project bullet..."] }
    ]},
    { "type": "bullet-point", "title": "Education", "content": [
      { "type": "bullet-points", "title": [${process.env.REACT_APP_RESUMEMSEDUCATION} (GPA: ${process.env.REACT_APP_RESUMEMSEDUCATIONGPA}) - ${process.env.REACT_APP_RESUMEBSEDUCATIONUNIVERSITY} | ${process.env.REACT_APP_RESUMEMSEDUCATIONYEAR}"], "content": [] },
      { "type": "bullet-points", "title": ["${process.env.REACT_APP_RESUMEBSEDUCATION} - ${process.env.REACT_APP_RESUMEBSEDUCATIONUNIVERSITY} | ${process.env.REACT_APP_RESUMEBSEDUCATIONYEAR}"], "content": [] }
    ]},
    { "type": "bullet-points", "title": "Certifications", "content": ["Certification Name <optional: '- Certification Code'> | year" <example: "Microsoft Azure Administrator - AZ-104 | 2025">] }
  ]
}
---
MASTER DOC: ${masterText}
---
JOB DESCRIPTION: ${job.cleanText}`;
      // Replace your existing cleaning/parsing logic with this:
      const response = await generateContent(prompt);

      // 1. Improved Extraction: Look for the first '{' and last '}'
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error(
          "No JSON found in AI response. Raw output: " + response,
        );
      }

      const cleanedJson = jsonMatch[0].trim();
      const parsedAI = JSON.parse(cleanedJson);

      // 2. Build the final payload
      const finalPayload = {
        type: "resume",
        docName: `${process.env.REACT_APP_RESUMENAME.replace(/\s+/g, "_")}_${job.company.replace(/\s+/g, "_")}_Resume`,
        resumeData: parsedAI, // Directly use the parsedAI object!
      };

      // 3. TRANSMIT
      setStatusMsg("📤 Transmitting to Google Docs Factory...");
      const fetchResponse = await fetch(process.env.REACT_APP_WEBAPPURL!, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(finalPayload),
      });

      const result = await fetchResponse.json();
      if (!result.success) throw new Error(result.error);

      setStatusMsg("✅ Success! Resume generated.");
      window.open(result.url, "_blank");
    } catch (error: any) {
      console.error("❌ CRITICAL ERROR in handleGenerateResume:", error);
      setStatusMsg(`❌ Error: ${error.message}`);
    } finally {
      setIsResumeGenerating(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "15px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "20px",
          gap: "10px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#1a73e8",
            cursor: "pointer",
            fontSize: "24px",
            padding: "0",
          }}
        >
          &larr;
        </button>
        <h2 style={{ margin: 0, fontSize: "18px", color: "#333" }}>
          Job Application
        </h2>
      </div>

      {/* Job Info Card */}
      <div
        style={{
          padding: "15px",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          border: "1px solid #ddd",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ margin: "0 0 5px 0", fontSize: "16px", color: "#1a0dab" }}>
          {job.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#555",
            fontWeight: "bold",
          }}
        >
          🏢 {job.company}
        </p>
        <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "#777" }}>
          Saved: {new Date(job.savedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Action Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <button
          onClick={handleGenerateResume}
          disabled={isResumeGenerating}
          style={{
            padding: "12px",
            backgroundColor: "#0F9D58",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isResumeGenerating ? "wait" : "pointer",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          {isResumeGenerating
            ? "⚙️ Processing Resume Pipeline..."
            : "📄 Generate Resume"}
        </button>
        <button
          onClick={handleGenerateCoverLetter}
          disabled={isCoverLetterGenerating}
          style={{
            padding: "12px",
            backgroundColor: "#0F9D58",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isCoverLetterGenerating ? "wait" : "pointer",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          {isCoverLetterGenerating
            ? "⚙️ Processing Cover Letter Pipeline..."
            : "📄 Generate Cover Letter"}
        </button>

        {statusMsg && (
          <div
            style={{
              fontSize: "13px",
              color: "#137333",
              marginTop: "5px",
            }}
          >
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
};
