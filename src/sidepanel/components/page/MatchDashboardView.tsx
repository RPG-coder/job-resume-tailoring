import React, { useState, useEffect } from "react";
import { Job } from "../../../interfaces/global";
import { aggregateAllMetadata } from "../../../util/gdrive";
import { rankJobsAgainstMaster } from "../../../util/embedding";

interface MatchDashboardViewProps {
  token: string;
  onBack: () => void;
}

export const MatchDashboardView: React.FC<MatchDashboardViewProps> = ({
  token,
  onBack,
}) => {
  const [rankedJobs, setRankedJobs] = useState<(Job & { score: number })[]>([]);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [masterDocName, setMasterDocName] = useState<string>("Loading...");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 1. Load the Master Document Info on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["masterDocumentName"],
      (result: { masterDocumentName?: string }) => {
        if (result.masterDocumentName) {
          setMasterDocName(result.masterDocumentName);
        } else {
          setMasterDocName("No Master Profile Found");
        }
      },
    );
  }, []);

  // 2. The Execution Engine
  const handleRunMatrix = async () => {
    setIsCalculating(true);
    setErrorMsg("");
    setRankedJobs([]);

    try {
      // Step A: Get Master Vector from Local Storage
      const storage = await chrome.storage.local.get(["masterDocumentVector"]);
      const masterVector = storage.masterDocumentVector as number[] | undefined;

      if (!masterVector || masterVector.length === 0) {
        throw new Error(
          "No vectorized Master Document found. Please upload one in Setup first.",
        );
      }

      // Step B: Fetch all jobs from all folders
      const allJobs = await aggregateAllMetadata(token);
      if (allJobs.length === 0) {
        throw new Error(
          "No jobs found in your Google Drive to compare against.",
        );
      }

      // Step C: Run the math
      const scoredAndSortedJobs = rankJobsAgainstMaster(masterVector, allJobs);
      setRankedJobs(scoredAndSortedJobs);
    } catch (error: any) {
      console.error("Matrix execution failed:", error);
      setErrorMsg(error.message || "Failed to calculate matrix.");
    } finally {
      setIsCalculating(false);
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
          Unified RAG Matrix
        </h2>
      </div>

      {/* Control Panel */}
      <div
        style={{
          backgroundColor: "#f8f9fa",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #ddd",
        }}
      >
        <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#555" }}>
          <strong>Baseline Profile:</strong> {masterDocName}
        </p>
        <button
          onClick={handleRunMatrix}
          disabled={
            isCalculating || masterDocName === "No Master Profile Found"
          }
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "#0F9D58",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isCalculating ? "wait" : "pointer",
            fontWeight: "bold",
          }}
        >
          {isCalculating ? "Aggregating & Scoring..." : "🚀 Run Global Match"}
        </button>
        {errorMsg && (
          <p style={{ color: "#c5221f", fontSize: "12px", marginTop: "10px" }}>
            {errorMsg}
          </p>
        )}
      </div>

      {/* Results List */}
      <h3 style={{ fontSize: "14px", color: "#555", marginBottom: "10px" }}>
        Ranked Opportunities ({rankedJobs.length})
      </h3>

      {rankedJobs.length > 0 && (
        <ul style={{ paddingLeft: "0", listStyleType: "none", margin: 0 }}>
          {rankedJobs.map((job, index) => {
            // Convert 0-1 score to a readable percentage
            const matchPercentage = (job.score * 100).toFixed(1);

            return (
              <li
                key={index}
                style={{
                  marginBottom: "10px",
                  padding: "12px",
                  border: "1px solid #eee",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontWeight: "bold",
                      color: "#1a0dab",
                      textDecoration: "none",
                      fontSize: "14px",
                      flex: 1,
                    }}
                  >
                    {job.title}
                  </a>
                  <span
                    style={{
                      backgroundColor: job.score > 0.4 ? "#e6f4ea" : "#f1f3f4",
                      color: job.score > 0.4 ? "#137333" : "#5f6368",
                      padding: "4px 8px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      marginLeft: "10px",
                    }}
                  >
                    {matchPercentage}% Match
                  </span>
                </div>
                <div
                  style={{ color: "#777", marginTop: "6px", fontSize: "12px" }}
                >
                  <strong>🏢 {job.company}</strong> • Saved:{" "}
                  {new Date(job.savedAt).toLocaleDateString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
