"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MistakeEntry } from "@/lib/types";
import { loadEntry, updateEntry, deleteEntry, getNextReviewDate } from "@/lib/storage";
import MistakeForm from "@/components/MistakeForm";
import Link from "next/link";

export default function EntryPage() {
  const params = useParams();
  const router = useRouter();
  const [entry, setEntry] = useState<MistakeEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetchEntry = async () => {
    const found = await loadEntry(params.id as string);
    if (found) {
      setEntry(found);
    } else {
      setNotFound(true);
    }
  };

  useEffect(() => {
    fetchEntry();
  }, [params.id]);

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Entry not found</h1>
        <Link href="/" className="text-blue-600 hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Edit Entry</h1>
        <MistakeForm
          existing={entry}
          onSaved={async () => {
            const updated = await loadEntry(entry.id);
            if (updated) setEntry(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const handleMarkReviewed = async (confidence: 1 | 2 | 3 | 4 | 5) => {
    const updated: MistakeEntry = {
      ...entry,
      reviewCount: entry.reviewCount + 1,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: getNextReviewDate(entry.reviewCount + 1, confidence),
      confidence,
    };
    const result = await updateEntry(updated);
    if (result) setEntry(result);
  };

  const handleDelete = async () => {
    if (confirm("Delete this entry permanently?")) {
      await deleteEntry(entry.id);
      router.push("/");
    }
  };

  const sectionClass = "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5";
  const headingClass = "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
            Edit
          </button>
          <button onClick={handleDelete} className="text-sm px-4 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{entry.subject}</span>
        <span className="px-3 py-1 text-sm font-medium rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">{entry.organSystem}</span>
        <span className="px-3 py-1 text-sm font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">{entry.mistakeType}</span>
      </div>

      {/* Screenshot */}
      {entry.imageUrl && (
        <div className={sectionClass}>
          <h2 className={headingClass}>Screenshot</h2>
          <img src={entry.imageUrl} alt="Question screenshot" className="max-w-full rounded-lg border border-slate-200 dark:border-slate-700" />
        </div>
      )}

      {/* Question Info */}
      {entry.questionStem && (
        <div className={sectionClass}>
          <h2 className={headingClass}>Question Stem</h2>
          <p className="text-sm whitespace-pre-wrap">{entry.questionStem}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entry.wrongAnswer && (
          <div className={sectionClass + " border-red-200 dark:border-red-800/50"}>
            <h2 className={headingClass + " text-red-400"}>What I Picked (Wrong)</h2>
            <p className="text-sm whitespace-pre-wrap">{entry.wrongAnswer}</p>
          </div>
        )}
        {entry.correctAnswer && (
          <div className={sectionClass + " border-green-200 dark:border-green-800/50"}>
            <h2 className={headingClass + " text-green-500"}>Correct Answer</h2>
            <p className="text-sm whitespace-pre-wrap">{entry.correctAnswer}</p>
          </div>
        )}
      </div>

      {entry.whyIGotItWrong && (
        <div className={sectionClass}>
          <h2 className={headingClass}>Why I Got It Wrong</h2>
          <p className="text-sm whitespace-pre-wrap">{entry.whyIGotItWrong}</p>
        </div>
      )}

      {entry.keyLearningPoint && (
        <div className={sectionClass + " bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800"}>
          <h2 className={headingClass + " text-green-600 dark:text-green-400"}>Key Learning Point</h2>
          <p className="text-sm font-medium whitespace-pre-wrap">{entry.keyLearningPoint}</p>
        </div>
      )}

      {entry.mnemonicOrTip && (
        <div className={sectionClass + " bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800"}>
          <h2 className={headingClass + " text-amber-600 dark:text-amber-400"}>Mnemonic / Tip</h2>
          <p className="text-sm whitespace-pre-wrap">{entry.mnemonicOrTip}</p>
        </div>
      )}

      {/* Topics to Review */}
      {entry.topicsToReview && entry.topicsToReview.length > 0 && (
        <div className={sectionClass + " bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"}>
          <h2 className={headingClass + " text-blue-600 dark:text-blue-400"}>Topics to Review</h2>
          <ul className="space-y-1.5">
            {entry.topicsToReview.map((topic, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* High Yield Facts */}
      {entry.highYieldFacts && entry.highYieldFacts.length > 0 && (
        <div className={sectionClass + " bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"}>
          <h2 className={headingClass + " text-purple-600 dark:text-purple-400"}>High-Yield Related Facts</h2>
          <ul className="space-y-1.5">
            {entry.highYieldFacts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Extracted Text */}
      {entry.extractedText && (
        <div className={sectionClass}>
          <h2 className={headingClass}>OCR Extracted Text</h2>
          <pre className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-900 p-3 rounded-lg max-h-48 overflow-y-auto">
            {entry.extractedText}
          </pre>
        </div>
      )}

      {/* Review Section */}
      <div className={sectionClass}>
        <h2 className={headingClass}>Review Tracker</h2>
        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-4">
          <span>Reviewed {entry.reviewCount} times</span>
          {entry.lastReviewedAt && <span>Last: {new Date(entry.lastReviewedAt).toLocaleDateString()}</span>}
          {entry.nextReviewAt && (
            <span>
              Next: {new Date(entry.nextReviewAt).toLocaleDateString()}
              {new Date(entry.nextReviewAt) <= new Date() && <span className="ml-1 text-amber-600 font-bold">NOW</span>}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-3">How confident do you feel about this concept now?</p>
        <div className="flex gap-2">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              onClick={() => handleMarkReviewed(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                n <= 2 ? "bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                : n === 3 ? "bg-yellow-100 hover:bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                : "bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              }`}
            >
              {n === 1 && "1 - No clue"}
              {n === 2 && "2 - Shaky"}
              {n === 3 && "3 - Okay"}
              {n === 4 && "4 - Good"}
              {n === 5 && "5 - Nailed it"}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-400 text-center pb-4">
        Created {new Date(entry.createdAt).toLocaleString()} &middot; Updated {new Date(entry.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
