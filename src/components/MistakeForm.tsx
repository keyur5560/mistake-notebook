"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  MistakeEntry,
  USMLE_SUBJECTS,
  ORGAN_SYSTEMS,
  MISTAKE_TYPES,
  UsmleSubject,
  OrganSystem,
  MistakeType,
} from "@/lib/types";
import { addEntry, updateEntry, uploadImage, getNextReviewDate } from "@/lib/storage";
import ImageUpload from "./ImageUpload";

interface Props {
  existing?: MistakeEntry;
  onSaved: () => void;
  onCancel?: () => void;
}

export default function MistakeForm({ existing, onSaved, onCancel }: Props) {
  const [imageDataUrl, setImageDataUrl] = useState(""); // local base64 for preview/OCR
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl || ""); // supabase URL
  const [extractedText, setExtractedText] = useState(existing?.extractedText || "");
  const [subject, setSubject] = useState<UsmleSubject>(existing?.subject || USMLE_SUBJECTS[0]);
  const [organSystem, setOrganSystem] = useState<OrganSystem>(existing?.organSystem || ORGAN_SYSTEMS[0]);
  const [mistakeType, setMistakeType] = useState<MistakeType>(existing?.mistakeType || MISTAKE_TYPES[0]);
  const [questionStem, setQuestionStem] = useState(existing?.questionStem || "");
  const [wrongAnswer, setWrongAnswer] = useState(existing?.wrongAnswer || "");
  const [correctAnswer, setCorrectAnswer] = useState(existing?.correctAnswer || "");
  const [whyIGotItWrong, setWhyIGotItWrong] = useState(existing?.whyIGotItWrong || "");
  const [keyLearningPoint, setKeyLearningPoint] = useState(existing?.keyLearningPoint || "");
  const [mnemonicOrTip, setMnemonicOrTip] = useState(existing?.mnemonicOrTip || "");
  const [topicsToReview, setTopicsToReview] = useState<string[]>(existing?.topicsToReview || []);
  const [highYieldFacts, setHighYieldFacts] = useState<string[]>(existing?.highYieldFacts || []);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleTextExtracted = async (text: string) => {
    setExtractedText(text);

    if (!text || text.trim().length < 10) return;

    setAnalyzing(true);
    setAnalyzeError("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedText: text }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data = await res.json();

      if (data.subject && USMLE_SUBJECTS.includes(data.subject)) setSubject(data.subject);
      if (data.organSystem && ORGAN_SYSTEMS.includes(data.organSystem)) setOrganSystem(data.organSystem);
      if (data.mistakeType && MISTAKE_TYPES.includes(data.mistakeType)) setMistakeType(data.mistakeType);
      if (data.questionStem) setQuestionStem(data.questionStem);
      if (data.wrongAnswer) setWrongAnswer(data.wrongAnswer);
      if (data.correctAnswer) setCorrectAnswer(data.correctAnswer);
      if (data.whyIGotItWrong) setWhyIGotItWrong(data.whyIGotItWrong);
      if (data.keyLearningPoint) setKeyLearningPoint(data.keyLearningPoint);
      if (data.mnemonicOrTip) setMnemonicOrTip(data.mnemonicOrTip);
      if (data.topicsToReview) setTopicsToReview(data.topicsToReview);
      if (data.highYieldFacts) setHighYieldFacts(data.highYieldFacts);
    } catch (err) {
      console.error("Analysis failed:", err);
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
      if (!questionStem) setQuestionStem(text.trim());
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Upload new image to Supabase Storage if we have a local base64
      let finalImageUrl = imageUrl;
      if (imageDataUrl) {
        const uploaded = await uploadImage(imageDataUrl);
        if (uploaded) finalImageUrl = uploaded;
      }

      const now = new Date().toISOString();
      const entry: MistakeEntry = {
        id: existing?.id || uuidv4(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        imageUrl: finalImageUrl,
        extractedText,
        subject,
        organSystem,
        mistakeType,
        questionStem,
        wrongAnswer,
        correctAnswer,
        whyIGotItWrong,
        keyLearningPoint,
        mnemonicOrTip,
        topicsToReview,
        highYieldFacts,
        reviewCount: existing?.reviewCount || 0,
        lastReviewedAt: existing?.lastReviewedAt || null,
        nextReviewAt: existing?.nextReviewAt || getNextReviewDate(0, 1),
        confidence: existing?.confidence || 1,
      };

      if (existing) {
        await updateEntry(entry);
      } else {
        await addEntry(entry);
      }

      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1";
  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const textareaClass = inputClass + " min-h-[80px] resize-y";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Image Upload */}
      <div>
        <label className={labelClass}>Screenshot</label>
        <ImageUpload
          onImageCapture={setImageDataUrl}
          onTextExtracted={handleTextExtracted}
          existingImage={existing?.imageUrl}
        />
      </div>

      {/* AI Analysis Status */}
      {analyzing && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
          <svg className="animate-spin h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Analyzing with Groq...
            </p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400">
              Auto-filling fields, identifying topics, and generating study tips
            </p>
          </div>
        </div>
      )}

      {analyzeError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <strong>Analysis failed:</strong> {analyzeError}
          <br />
          <span className="text-xs">Fields have been left for you to fill manually. Make sure GROQ_API_KEY is set in .env.local</span>
        </div>
      )}

      {/* Extracted Text */}
      {extractedText && (
        <div>
          <label className={labelClass}>OCR Extracted Text (editable)</label>
          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            className={textareaClass + " min-h-[100px] font-mono text-xs"}
          />
          {!analyzing && extractedText.trim().length >= 10 && (
            <button
              type="button"
              onClick={() => handleTextExtracted(extractedText)}
              className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Re-analyze with Groq
            </button>
          )}
        </div>
      )}

      {/* Classification Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value as UsmleSubject)} className={inputClass}>
            {USMLE_SUBJECTS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Organ System</label>
          <select value={organSystem} onChange={(e) => setOrganSystem(e.target.value as OrganSystem)} className={inputClass}>
            {ORGAN_SYSTEMS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Why I Got It Wrong</label>
          <select value={mistakeType} onChange={(e) => setMistakeType(e.target.value as MistakeType)} className={inputClass}>
            {MISTAKE_TYPES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
      </div>

      {/* Question Details */}
      <div>
        <label className={labelClass}>Question Stem / Key Info</label>
        <textarea value={questionStem} onChange={(e) => setQuestionStem(e.target.value)} className={textareaClass} placeholder="Paste or type the key part of the question..." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>What I Picked (Wrong)</label>
          <textarea value={wrongAnswer} onChange={(e) => setWrongAnswer(e.target.value)} className={textareaClass} placeholder="The answer you chose and your reasoning..." />
        </div>
        <div>
          <label className={labelClass}>Correct Answer</label>
          <textarea value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className={textareaClass} placeholder="The right answer and why it's correct..." />
        </div>
      </div>

      <div>
        <label className={labelClass}>Why I Got It Wrong (Deep Dive)</label>
        <textarea value={whyIGotItWrong} onChange={(e) => setWhyIGotItWrong(e.target.value)} className={textareaClass} placeholder="What was the gap in your knowledge or reasoning?" />
      </div>

      <div>
        <label className={labelClass}>Key Learning Point</label>
        <textarea value={keyLearningPoint} onChange={(e) => setKeyLearningPoint(e.target.value)} className={textareaClass + " border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"} placeholder="The ONE thing you need to remember from this question..." />
      </div>

      <div>
        <label className={labelClass}>Mnemonic / Memory Tip</label>
        <textarea value={mnemonicOrTip} onChange={(e) => setMnemonicOrTip(e.target.value)} className={textareaClass} placeholder="Any mnemonic, association, or trick to remember this..." />
      </div>

      {/* AI-Generated Study Suggestions */}
      {topicsToReview.length > 0 && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Topics to Review</h3>
          <ul className="space-y-1">
            {topicsToReview.map((topic, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {highYieldFacts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2">High-Yield Related Facts</h3>
          <ul className="space-y-1">
            {highYieldFacts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || analyzing}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : existing ? "Update Entry" : "Save Entry"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-medium text-sm transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
