import React, { useRef, useState } from "react";

interface DocumentUploadProps {
  onFileLoaded: (fileName: string, textContent: string) => Promise<void>;
  isUploading: boolean;
  accept?: string;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onFileLoaded,
  isUploading,
  accept = ".txt,.pdf,.md",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState<string>("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await onFileLoaded(file.name, text);
    };

    // For text-based resume processing (.txt, .md).
    // If handling binary PDFs, you'd integrate a PDF parser here.
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        style={{ display: "none" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{
            padding: "8px 14px",
            backgroundColor: "#1a73e8",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isUploading ? "wait" : "pointer",
            fontWeight: "bold",
          }}
        >
          {isUploading ? "Uploading..." : "📁 Select Document"}
        </button>
        <span style={{ fontSize: "13px", color: "#666" }}>
          {selectedName || "No file selected"}
        </span>
      </div>
    </div>
  );
};
