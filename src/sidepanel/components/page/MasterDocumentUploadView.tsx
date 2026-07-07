import React, { useState } from "react";
import { MasterDocumentUpload } from "../organisms/MasterDocumentUpload";

interface MasterDocumentUploadViewProps {
  token: string;
  onBack: () => void;
}

export const MasterDocumentUploadView: React.FC<
  MasterDocumentUploadViewProps
> = ({ token, onBack }) => {
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "15px" }}>
      {/* 1. Header with Back Button */}
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
            padding: "0 8px 0 0",
            lineHeight: "1",
          }}
          title="Go Back"
        >
          &larr;
        </button>
        <h2 style={{ margin: 0, fontSize: "18px", color: "#333" }}>
          Global Settings
        </h2>
      </div>

      {/* 2. Status Notification Banner */}
      {statusMsg && (
        <div
          style={{
            padding: "10px",
            marginBottom: "15px",
            borderRadius: "4px",
            backgroundColor:
              statusMsg.type === "success" ? "#e6f4ea" : "#fce8e6",
            color: statusMsg.type === "success" ? "#137333" : "#c5221f",
            fontSize: "13px",
            border: `1px solid ${statusMsg.type === "success" ? "#ceead6" : "#fad2cf"}`,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* 3. The Upload Organism */}
      <MasterDocumentUpload
        token={token}
        onUploadSuccess={(msg) => setStatusMsg({ type: "success", text: msg })}
        onUploadError={(msg) => setStatusMsg({ type: "error", text: msg })}
      />
    </div>
  );
};
