import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Job } from "../interfaces/global";
import {
  fetchMetadataFromDrive,
  syncMetadataToDrive,
  getDomainFolderName,
} from "../util/gdrive";
import {
  generateEmbedding,
  calculateCosineSimilarity,
} from "../util/embedding";
import { MasterDocumentUploadView } from "./components/page/MasterDocumentUploadView";
import { MatchDashboardView } from "./components/page/MatchDashboardView";
import { JobDetailsView } from "./components/page/JobDetailsView";

declare global {
  const LanguageModel: any;
}

const Sidepanel = () => {
  // --- STATE MANAGEMENT ---
  const [currentDomain, setCurrentDomain] = useState<string>("Unknown");
  // --- ROUTING STATE ---
  const [currentView, setCurrentView] = useState<
    "MAIN" | "MASTER_DOC" | "MATRIX_DASHBOARD" | "JOB_DETAILS"
  >("MAIN");
  const [focusedJob, setFocusedJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [token, setToken] = useState<string>("");

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const [userQuery, setUserQuery] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);

  // --- HELPER: Safely get the active tab's domain ---
  const fetchActiveDomain = async (): Promise<string> => {
    // Try last focused window first, fallback to current window
    let tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    if (
      tabs.length > 0 &&
      tabs[0].url &&
      !tabs[0].url.startsWith("chrome://")
    ) {
      console.log("🎯 Active Tab Found:", tabs[0].url);
      return getDomainFolderName(tabs[0].url);
    }
    return "Unknown";
  };

  // --- 1. INITIALIZATION: GET DOMAIN & FETCH DATA ---
  useEffect(() => {
    setJobs([]);
    const initializePanel = async () => {
      const domain = await fetchActiveDomain();
      setCurrentDomain(domain);

      if (domain !== "Unknown") {
        chrome.runtime.sendMessage(
          { action: "GET_AUTH_TOKEN" },
          async (response) => {
            if (response?.status === "success" && response.token) {
              setToken(response.token);
              await loadDomainJobs(domain, response.token);
            }
          },
        );
      }
    };

    initializePanel();

    // 🌟 NEW: Listen for when the user switches tabs!
    const handleTabChange = async () => {
      const newDomain = await fetchActiveDomain();
      if (newDomain !== currentDomain) {
        setCurrentDomain(newDomain);
      }
    };

    chrome.tabs.onActivated.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabChange);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabChange);
      chrome.tabs.onUpdated.removeListener(handleTabChange);
    };
  }, [currentDomain]);

  // --- RE-FETCH BUTTON HANDLER ---
  const handleManualReFetch = async () => {
    setIsSyncing(true);

    // 1. Force the domain to be re-detected
    const activeDomain = await fetchActiveDomain();

    // 2. CLEAR the current state so we don't accidentally merge old data
    setJobs([]);
    setCurrentDomain(activeDomain);

    if (activeDomain === "Unknown") {
      setIsSyncing(false);
      return;
    }

    chrome.runtime.sendMessage(
      { action: "GET_AUTH_TOKEN" },
      async (response) => {
        if (response?.status === "success" && response.token) {
          // 3. THIS IS THE KEY: Load fresh data from Drive, not the local state
          await loadDomainJobs(activeDomain, response.token);
        }
        setIsSyncing(false);
      },
    );
  };

  // Update this function inside src/sidepanel/index.tsx
  const loadDomainJobs = async (domain: string, authToken: string) => {
    // Extra validation guard
    if (!authToken || authToken === "undefined") {
      console.error("❌ Cannot fetch: authToken parameter is empty!");
      return;
    }

    setIsSyncing(true);
    try {
      const data = await fetchMetadataFromDrive(domain, authToken);
      if (data) setJobs(data);
    } catch (error) {
      console.error("Failed to fetch domain metadata:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- 2. LISTEN FOR NEW JOBS FROM WEBPAGE ---
  useEffect(() => {
    const messageListener = async (message: any) => {
      if (message.action === "PROCESS_NEW_JOB") {
        // Check for token existence right at the start
        if (!token) {
          setAiResponse(
            "Error: Authentication token missing. Please Re-Fetch.",
          );
          return;
        }

        // Validate payload
        if (!message.payload?.cleanText || !message.payload?.title) {
          setAiResponse("Error: Could not extract job details.");
          return;
        }

        setIsSyncing(true);
        setAiResponse("Processing job...");

        try {
          const progressCallback = (data: any) => {
            if (data.status === "progress")
              setDownloadProgress(Math.round(data.progress));
          };

          const embedding = await generateEmbedding(
            message.payload.cleanText,
            progressCallback,
          );

          const newJob: Job = {
            title: message.payload.title,
            url: message.payload.url,
            company: currentDomain,
            cleanText: message.payload.cleanText,
            embedding: embedding,
            savedAt: Date.now(),
          };

          // USE FUNCTIONAL UPDATES: This guarantees we always use the freshest state
          let currentLatestJobs: Job[] = [];
          setJobs((prevJobs) => {
            currentLatestJobs = [...prevJobs, newJob];
            return currentLatestJobs;
          });

          // Give React a microsecond to batch the state update, then sync
          await new Promise((resolve) => setTimeout(resolve, 0));
          await syncMetadataToDrive(currentDomain, currentLatestJobs, token);

          setAiResponse(`Successfully saved: ${newJob.title}`);
        } finally {
          setIsSyncing(false);
          setDownloadProgress(0);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [jobs, token, currentDomain]);

  // --- 3. THE RAG PIPELINE (LOCAL VECTOR SEARCH + GEMINI NANO) ---
  const handleAskAI = async () => {
    if (!userQuery.trim() || jobs.length === 0) return;

    // @ts-ignore
    if (typeof LanguageModel === "undefined") {
      alert("Chrome Built-in AI not available.");
      return;
    }

    setIsThinking(true);
    setAiResponse("Embedding your question...");

    try {
      // Step A: Embed the user's question
      const queryEmbedding = await generateEmbedding(userQuery);

      // Step B: Find the most relevant job using Cosine Similarity
      let bestMatch: Job | undefined;
      let highestScore = -1;

      jobs.forEach((job) => {
        const score = calculateCosineSimilarity(queryEmbedding, job.embedding);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = job;
        }
      });

      if (!bestMatch) throw new Error("No matching context found.");

      setAiResponse(
        `Found best match: ${bestMatch.title}. Generating answer...`,
      );

      // Step C: Feed the Context + Question to Gemini Nano
      // @ts-ignore
      const session = await LanguageModel.create({
        systemPrompt:
          "You are a helpful career assistant. Answer the user's question using ONLY the provided job description context. Be concise.",
      });

      const prompt = `Context Job Description:\n${bestMatch.cleanText}\n\nQuestion: ${userQuery}`;
      const result = await session.prompt(prompt);

      setAiResponse(`[Based on: ${bestMatch.title}]\n\n${result}`);
      session.destroy();
    } catch (error) {
      console.error("RAG Error:", error);
      setAiResponse("Failed to generate answer.");
    } finally {
      setIsThinking(false);
    }
  };

  // --- 4. RENDER UI ---
  // If the user navigated to the settings page, render that instead of the main feed
  if (currentView === "MASTER_DOC") {
    return (
      <MasterDocumentUploadView
        token={token}
        onBack={() => setCurrentView("MAIN")}
      />
    );
  }
  if (currentView === "MATRIX_DASHBOARD") {
    return (
      <MatchDashboardView token={token} onBack={() => setCurrentView("MAIN")} />
    );
  }
  if (currentView === "JOB_DETAILS" && focusedJob) {
    return (
      <JobDetailsView job={focusedJob} onBack={() => setCurrentView("MAIN")} />
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: "15px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}
      >
        <h2 style={{ margin: 0, color: "#1a73e8" }}>🏢 {currentDomain}</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setCurrentView("MATRIX_DASHBOARD")}
            style={{
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#e8eaed",
            }}
            title="Global Job Matrix"
          >
            📊 Matrix
          </button>
          <button
            onClick={() => setCurrentView("MASTER_DOC")}
            style={{
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#f8f9fa",
            }}
            title="Master Profile Settings"
          >
            ⚙️ Setup
          </button>
          <button
            onClick={handleManualReFetch}
            disabled={isSyncing}
            style={{
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          >
            {isSyncing ? "Syncing..." : "🔄 Re-Fetch"}
          </button>
        </div>
      </div>

      {downloadProgress > 0 && downloadProgress < 100 && (
        <div style={{ marginBottom: "15px", fontSize: "12px", color: "#666" }}>
          Downloading AI Model: {downloadProgress}%
          <div
            style={{
              width: "100%",
              backgroundColor: "#eee",
              height: "4px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                width: `${downloadProgress}%`,
                backgroundColor: "#1a73e8",
                height: "100%",
              }}
            />
          </div>
        </div>
      )}

      {/* RAG CHAT INTERFACE */}
      <div
        style={{
          backgroundColor: "#f8f9fa",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #ddd",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
          Ask about your saved {currentDomain} jobs:
        </h3>
        <textarea
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
          placeholder="e.g., Which role requires Python? Or summarize the requirements."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            marginBottom: "10px",
            minHeight: "60px",
            resize: "vertical",
          }}
        />
        <button
          onClick={handleAskAI}
          disabled={isThinking || !userQuery.trim() || jobs.length === 0}
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor:
              isThinking || jobs.length === 0 ? "#ccc" : "#0F9D58",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isThinking ? "wait" : "pointer",
            fontWeight: "bold",
          }}
        >
          {isThinking ? "Thinking..." : "✨ Ask Local AI"}
        </button>
      </div>

      {aiResponse && (
        <div
          style={{
            padding: "12px",
            marginBottom: "20px",
            backgroundColor: "#E8F0FE",
            borderLeft: "4px solid #1a73e8",
            borderRadius: "4px",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>🤖 Assistant:</strong>
          <br />
          {aiResponse}
        </div>
      )}

      <hr style={{ border: "1px solid #eee", margin: "20px 0" }} />
      <h3 style={{ fontSize: "14px", color: "#555", marginBottom: "10px" }}>
        Saved Context ({jobs.length} jobs)
      </h3>

      {jobs.length === 0 ? (
        <p style={{ color: "#888", fontSize: "13px" }}>
          No jobs saved for {currentDomain} yet. Go to a job posting and click
          'Add Page to Job Interest'.
        </p>
      ) : (
        <ul style={{ paddingLeft: "0", listStyleType: "none", margin: 0 }}>
          {jobs.map((job, index) => (
            <li
              key={index}
              style={{
                marginBottom: "8px",
                padding: "10px",
                border: "1px solid #eee",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            >
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  setFocusedJob(job);
                  setCurrentView("JOB_DETAILS");
                }}
                style={{
                  fontWeight: "bold",
                  color: "#1a0dab",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                {job.title}
              </a>
              <div
                style={{ color: "#777", marginTop: "4px", fontSize: "11px" }}
              >
                Saved: {new Date(job.savedAt).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<Sidepanel />);
}
