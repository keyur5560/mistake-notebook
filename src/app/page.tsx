"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MistakeEntry,
  USMLE_SUBJECTS,
  ORGAN_SYSTEMS,
  MISTAKE_TYPES,
} from "@/lib/types";
import { loadEntries, deleteEntry as deleteEntryFromDb, getDueForReview } from "@/lib/storage";
import EntryCard from "@/components/EntryCard";

export default function Dashboard() {
  const [entries, setEntries] = useState<MistakeEntry[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterSystem, setFilterSystem] = useState("");
  const [filterMistake, setFilterMistake] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [all, due] = await Promise.all([loadEntries(), getDueForReview()]);
    setEntries(all);
    setDueCount(due.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterSubject && e.subject !== filterSubject) return false;
      if (filterSystem && e.organSystem !== filterSystem) return false;
      if (filterMistake && e.mistakeType !== filterMistake) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          e.questionStem, e.correctAnswer, e.wrongAnswer,
          e.whyIGotItWrong, e.keyLearningPoint, e.mnemonicOrTip,
          e.extractedText, e.subject, e.organSystem,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, filterSubject, filterSystem, filterMistake]);

  const stats = useMemo(() => {
    const byMistakeType: Record<string, number> = {};
    const bySubject: Record<string, number> = {};
    entries.forEach((e) => {
      byMistakeType[e.mistakeType] = (byMistakeType[e.mistakeType] || 0) + 1;
      bySubject[e.subject] = (bySubject[e.subject] || 0) + 1;
    });
    const topMistakeType = Object.entries(byMistakeType).sort((a, b) => b[1] - a[1])[0];
    const topSubject = Object.entries(bySubject).sort((a, b) => b[1] - a[1])[0];
    return { topMistakeType, topSubject, byMistakeType };
  }, [entries]);

  const handleDelete = async (id: string) => {
    await deleteEntryFromDb(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const due = await getDueForReview();
    setDueCount(due.length);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  const selectClass =
    "rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mistake Notebook</h1>
          <p className="text-slate-500 text-sm mt-1">
            USMLE Step 1 &middot; {entries.length} entries logged
          </p>
        </div>
        <div className="flex gap-3">
          {dueCount > 0 && (
            <Link href="/review" className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Review ({dueCount})
            </Link>
          )}
          <Link href="/entry/new" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Log Mistake
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-2xl font-bold">{entries.length}</div>
            <div className="text-xs text-slate-500">Total Mistakes</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-2xl font-bold text-amber-600">{dueCount}</div>
            <div className="text-xs text-slate-500">Due for Review</div>
          </div>
          {stats.topMistakeType && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm font-bold truncate">{stats.topMistakeType[0]}</div>
              <div className="text-xs text-slate-500">Top Mistake ({stats.topMistakeType[1]}x)</div>
            </div>
          )}
          {stats.topSubject && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm font-bold truncate">{stats.topSubject[0]}</div>
              <div className="text-xs text-slate-500">Weakest Subject ({stats.topSubject[1]}x)</div>
            </div>
          )}
        </div>
      )}

      {/* Weakness Breakdown */}
      {entries.length >= 3 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-8">
          <h2 className="text-sm font-bold mb-3">Mistake Pattern Breakdown</h2>
          <div className="space-y-2">
            {Object.entries(stats.byMistakeType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-48 truncate">{type}</span>
                <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / entries.length) * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-slate-500 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries..." className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className={selectClass}>
            <option value="">All Subjects</option>
            {USMLE_SUBJECTS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select value={filterSystem} onChange={(e) => setFilterSystem(e.target.value)} className={selectClass}>
            <option value="">All Systems</option>
            {ORGAN_SYSTEMS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select value={filterMistake} onChange={(e) => setFilterMistake(e.target.value)} className={selectClass}>
            <option value="">All Mistake Types</option>
            {MISTAKE_TYPES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
      )}

      {/* Entry List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <div className="text-center py-12 text-slate-400">No entries match your filters.</div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📝</div>
          <h2 className="text-xl font-bold mb-2">Start Your Mistake Notebook</h2>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Upload screenshots of UWorld questions you got wrong, log your reasoning errors,
            and build a personalized review system with spaced repetition.
          </p>
          <Link href="/entry/new" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-block">
            Log Your First Mistake
          </Link>
        </div>
      )}
    </div>
  );
}
