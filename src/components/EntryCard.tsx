"use client";

import { MistakeEntry } from "@/lib/types";
import Link from "next/link";

interface Props {
  entry: MistakeEntry;
  onDelete: (id: string) => void;
}

const mistakeTypeColors: Record<string, string> = {
  "Misread the question": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Didn't know the concept": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "Knew it but picked wrong answer": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Narrowed to 2, picked wrong one": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Overthought it": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Careless error": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "Ran out of time": "bg-slate-100 text-slate-800 dark:bg-slate-700/50 dark:text-slate-300",
  Other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function EntryCard({ entry, onDelete }: Props) {
  const isDue =
    !entry.nextReviewAt || new Date(entry.nextReviewAt) <= new Date();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex">
        {entry.imageUrl && (
          <div className="w-28 h-28 flex-shrink-0 bg-slate-100 dark:bg-slate-900">
            <img src={entry.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {entry.subject}
                </span>
                <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                  {entry.organSystem}
                </span>
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${mistakeTypeColors[entry.mistakeType] || ""}`}>
                  {entry.mistakeType}
                </span>
                {isDue && (
                  <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse">
                    Due for review
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                {entry.keyLearningPoint || entry.questionStem || "No notes yet"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-400">
              {new Date(entry.createdAt).toLocaleDateString()} &middot; Reviewed {entry.reviewCount}x
            </span>
            <div className="flex gap-2">
              <Link href={`/entry/${entry.id}`} className="text-xs px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium">
                View
              </Link>
              <button
                onClick={() => { if (confirm("Delete this entry?")) onDelete(entry.id); }}
                className="text-xs px-3 py-1 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
