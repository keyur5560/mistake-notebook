"use client";

import { useEffect, useState } from "react";
import { MistakeEntry } from "@/lib/types";
import { getDueForReview, updateEntry, getNextReviewDate } from "@/lib/storage";
import Link from "next/link";

export default function ReviewPage() {
  const [queue, setQueue] = useState<MistakeEntry[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDueForReview().then((entries) => {
      setQueue(entries);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (done || queue.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">{queue.length === 0 ? "🎉" : "✅"}</div>
        <h1 className="text-2xl font-bold mb-2">
          {queue.length === 0 ? "No entries due for review!" : `Review complete! ${queue.length} entries reviewed.`}
        </h1>
        <p className="text-slate-500 mb-6">
          {queue.length === 0 ? "Add some mistakes or check back later." : "Great work! Keep it up."}
        </p>
        <Link href="/" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors inline-block">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const entry = queue[currentIdx];

  const handleRate = async (confidence: 1 | 2 | 3 | 4 | 5) => {
    const updated: MistakeEntry = {
      ...entry,
      reviewCount: entry.reviewCount + 1,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: getNextReviewDate(entry.reviewCount + 1, confidence),
      confidence,
    };
    await updateEntry(updated);

    if (currentIdx + 1 >= queue.length) {
      setDone(true);
    } else {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    }
  };

  const sectionClass = "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Exit Review
        </Link>
        <span className="text-sm text-slate-500 font-medium">{currentIdx + 1} / {queue.length}</span>
      </div>

      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-8">
        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${((currentIdx + 1) / queue.length) * 100}%` }} />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{entry.subject}</span>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">{entry.organSystem}</span>
        </div>

        {entry.imageUrl && (
          <div className={sectionClass}>
            <img src={entry.imageUrl} alt="Question" className="max-w-full rounded-lg" />
          </div>
        )}

        {entry.questionStem && (
          <div className={sectionClass}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Question</h2>
            <p className="text-sm whitespace-pre-wrap">{entry.questionStem}</p>
          </div>
        )}

        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg transition-colors">
            Show Answer
          </button>
        ) : (
          <div className="space-y-4">
            {entry.correctAnswer && (
              <div className={sectionClass + " border-green-200 dark:border-green-800/50"}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-green-500 mb-2">Correct Answer</h2>
                <p className="text-sm whitespace-pre-wrap">{entry.correctAnswer}</p>
              </div>
            )}
            {entry.wrongAnswer && (
              <div className={sectionClass + " border-red-200 dark:border-red-800/50"}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">What I Picked</h2>
                <p className="text-sm whitespace-pre-wrap">{entry.wrongAnswer}</p>
              </div>
            )}
            {entry.whyIGotItWrong && (
              <div className={sectionClass}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Why I Got It Wrong</h2>
                <p className="text-sm whitespace-pre-wrap">{entry.whyIGotItWrong}</p>
              </div>
            )}
            {entry.keyLearningPoint && (
              <div className={sectionClass + " bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800"}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-2">Key Learning Point</h2>
                <p className="text-sm font-medium whitespace-pre-wrap">{entry.keyLearningPoint}</p>
              </div>
            )}
            {entry.mnemonicOrTip && (
              <div className={sectionClass + " bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800"}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">Mnemonic / Tip</h2>
                <p className="text-sm whitespace-pre-wrap">{entry.mnemonicOrTip}</p>
              </div>
            )}

            <div className="pt-4">
              <p className="text-center text-sm text-slate-500 mb-3">How confident do you feel now?</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => handleRate(n)}
                    className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105 ${
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
          </div>
        )}
      </div>
    </div>
  );
}
