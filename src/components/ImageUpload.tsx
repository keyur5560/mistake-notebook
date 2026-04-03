"use client";

import { useCallback, useState, useRef } from "react";
import Tesseract from "tesseract.js";

interface Props {
  onImageCapture: (dataUrl: string) => void;
  onTextExtracted: (text: string) => void;
  existingImage?: string;
}

export default function ImageUpload({
  onImageCapture,
  onTextExtracted,
  existingImage,
}: Props) {
  const [preview, setPreview] = useState<string>(existingImage || "");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(
    async (dataUrl: string) => {
      setPreview(dataUrl);
      onImageCapture(dataUrl);
      setExtracting(true);
      setProgress(0);

      try {
        const result = await Tesseract.recognize(dataUrl, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        onTextExtracted(result.data.text);
      } catch (err) {
        console.error("OCR failed:", err);
      } finally {
        setExtracting(false);
      }
    },
    [onImageCapture, onTextExtracted]
  );

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        processImage(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [processImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    },
    [handleFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={handlePaste}
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 dark:bg-slate-800/50"
      >
        {preview ? (
          <img
            src={preview}
            alt="Screenshot preview"
            className="max-h-64 mx-auto rounded-lg shadow-sm"
          />
        ) : (
          <div className="space-y-2 text-slate-500 dark:text-slate-400">
            <svg
              className="w-12 h-12 mx-auto text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="font-medium">
              Drop screenshot, paste from clipboard, or click to upload
            </p>
            <p className="text-sm">Supports PNG, JPG, WEBP</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {extracting && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Extracting text from image... {progress}%
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {preview && !extracting && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreview("");
            onImageCapture("");
            onTextExtracted("");
            if (fileRef.current) fileRef.current.value = "";
          }}
          className="text-sm text-red-500 hover:text-red-700 underline"
        >
          Remove image
        </button>
      )}
    </div>
  );
}
