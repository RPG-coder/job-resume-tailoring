import React, { useState } from "react";
import { DocumentUpload } from "../atoms/DocumentUpload";
import { uploadMasterDocumentToDrive } from "../../../util/gdrive";
import { generateEmbedding } from "../../../util/embedding";

interface MasterDocumentUploadProps {
  token: string;
  onUploadSuccess: (msg: string) => void;
  onUploadError: (msg: string) => void;
}

export const MasterDocumentUpload: React.FC<MasterDocumentUploadProps> = ({
  token,
  onUploadSuccess,
  onUploadError,
}) => {
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const handleMasterFileProcessing = async (
    fileName: string,
    textContent: string,
  ) => {
    if (!token) {
      onUploadError("Authentication missing. Please re-authenticate.");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Sync raw file to "Job Assistant/masterdocument.txt"
      await uploadMasterDocumentToDrive(token, textContent);

      // 2. Local AI Pipeline: Vectorize your profile data immediately
      console.log("🧠 Generating Vector Profile of Master Document...");
      const masterVector = await generateEmbedding(textContent);

      // Cache vector profile locally so vector queries run instantly
      await chrome.storage.local.set({
        masterDocumentVector: masterVector,
        masterDocumentText: textContent,
        masterDocumentName: fileName,
        masterDocumentUpdatedAt: Date.now(),
      });

      onUploadSuccess(
        `Successfully synchronized and vectorized master profile: ${fileName}`,
      );
    } catch (error: any) {
      console.error("Master upload pipeline failed:", error);
      onUploadError(error.message || "Failed to sync Master Document.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        padding: "16px",
        borderRadius: "8px",
        border: "1px solid #e0e0e0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", color: "#333" }}>
        🎯 Master Profile Baseline
      </h3>
      <p
        style={{
          margin: "0 0 14px 0",
          fontSize: "12px",
          color: "#666",
          lineHeight: "1.4",
        }}
      >
        Upload your core resume or background profile. The matrix uses this file
        to calculate distance scores across aggregated job listings.
      </p>

      <DocumentUpload
        onFileLoaded={handleMasterFileProcessing}
        isUploading={isUploading}
      />
    </div>
  );
};
