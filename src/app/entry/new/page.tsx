"use client";

import { useRouter } from "next/navigation";
import MistakeForm from "@/components/MistakeForm";
import Link from "next/link";

export default function NewEntryPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Log a Mistake</h1>
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Cancel
        </Link>
      </div>
      <MistakeForm onSaved={() => router.push("/")} />
    </div>
  );
}
