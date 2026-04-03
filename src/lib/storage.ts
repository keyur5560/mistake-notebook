import { getSupabase } from "./supabase";
import { MistakeEntry } from "./types";
import { v4 as uuidv4 } from "uuid";

// Spaced repetition intervals in days
const INTERVALS = [1, 3, 7, 14, 30, 60];

export function getNextReviewDate(reviewCount: number, confidence: number): string {
  const intervalIdx = Math.min(reviewCount, INTERVALS.length - 1);
  const multiplier = confidence >= 4 ? 1.5 : confidence >= 3 ? 1 : 0.5;
  const days = Math.round(INTERVALS[intervalIdx] * multiplier);
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

// Convert DB row (snake_case) to app type (camelCase)
function rowToEntry(row: Record<string, unknown>): MistakeEntry {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    imageUrl: (row.image_url as string) || "",
    extractedText: (row.extracted_text as string) || "",
    subject: row.subject as MistakeEntry["subject"],
    organSystem: row.organ_system as MistakeEntry["organSystem"],
    mistakeType: row.mistake_type as MistakeEntry["mistakeType"],
    questionStem: (row.question_stem as string) || "",
    wrongAnswer: (row.wrong_answer as string) || "",
    correctAnswer: (row.correct_answer as string) || "",
    whyIGotItWrong: (row.why_i_got_it_wrong as string) || "",
    keyLearningPoint: (row.key_learning_point as string) || "",
    mnemonicOrTip: (row.mnemonic_or_tip as string) || "",
    topicsToReview: (row.topics_to_review as string[]) || [],
    highYieldFacts: (row.high_yield_facts as string[]) || [],
    reviewCount: (row.review_count as number) || 0,
    lastReviewedAt: (row.last_reviewed_at as string) || null,
    nextReviewAt: (row.next_review_at as string) || null,
    confidence: (row.confidence as 1 | 2 | 3 | 4 | 5) || 1,
  };
}

// Convert app type to DB row for inserts/updates
function entryToRow(entry: Partial<MistakeEntry>) {
  const row: Record<string, unknown> = {};
  if (entry.id !== undefined) row.id = entry.id;
  if (entry.extractedText !== undefined) row.extracted_text = entry.extractedText;
  if (entry.imageUrl !== undefined) row.image_url = entry.imageUrl;
  if (entry.subject !== undefined) row.subject = entry.subject;
  if (entry.organSystem !== undefined) row.organ_system = entry.organSystem;
  if (entry.mistakeType !== undefined) row.mistake_type = entry.mistakeType;
  if (entry.questionStem !== undefined) row.question_stem = entry.questionStem;
  if (entry.wrongAnswer !== undefined) row.wrong_answer = entry.wrongAnswer;
  if (entry.correctAnswer !== undefined) row.correct_answer = entry.correctAnswer;
  if (entry.whyIGotItWrong !== undefined) row.why_i_got_it_wrong = entry.whyIGotItWrong;
  if (entry.keyLearningPoint !== undefined) row.key_learning_point = entry.keyLearningPoint;
  if (entry.mnemonicOrTip !== undefined) row.mnemonic_or_tip = entry.mnemonicOrTip;
  if (entry.topicsToReview !== undefined) row.topics_to_review = entry.topicsToReview;
  if (entry.highYieldFacts !== undefined) row.high_yield_facts = entry.highYieldFacts;
  if (entry.reviewCount !== undefined) row.review_count = entry.reviewCount;
  if (entry.lastReviewedAt !== undefined) row.last_reviewed_at = entry.lastReviewedAt;
  if (entry.nextReviewAt !== undefined) row.next_review_at = entry.nextReviewAt;
  if (entry.confidence !== undefined) row.confidence = entry.confidence;
  row.updated_at = new Date().toISOString();
  return row;
}

// Upload image to Supabase Storage, returns public URL
export async function uploadImage(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return "";

  const ext = match[1].split("/")[1];
  const base64 = match[2];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `${uuidv4()}.${ext}`;

  const { error } = await getSupabase().storage
    .from("screenshots")
    .upload(fileName, bytes, { contentType: match[1] });

  if (error) {
    console.error("Upload error:", error);
    return "";
  }

  const { data } = getSupabase().storage
    .from("screenshots")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

// Delete image from Supabase Storage
export async function deleteImage(imageUrl: string): Promise<void> {
  if (!imageUrl) return;
  // Extract filename from the public URL
  const parts = imageUrl.split("/screenshots/");
  if (parts.length < 2) return;
  const fileName = parts[1];
  await getSupabase().storage.from("screenshots").remove([fileName]);
}

export async function loadEntries(): Promise<MistakeEntry[]> {
  const { data, error } = await getSupabase()
    .from("mistakes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load error:", error);
    return [];
  }
  return (data || []).map(rowToEntry);
}

export async function loadEntry(id: string): Promise<MistakeEntry | null> {
  const { data, error } = await getSupabase()
    .from("mistakes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return rowToEntry(data);
}

export async function addEntry(entry: MistakeEntry): Promise<MistakeEntry | null> {
  const row = entryToRow(entry);
  const { data, error } = await getSupabase()
    .from("mistakes")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return null;
  }
  return rowToEntry(data);
}

export async function updateEntry(entry: MistakeEntry): Promise<MistakeEntry | null> {
  const row = entryToRow(entry);
  const { data, error } = await getSupabase()
    .from("mistakes")
    .update(row)
    .eq("id", entry.id)
    .select()
    .single();

  if (error) {
    console.error("Update error:", error);
    return null;
  }
  return rowToEntry(data);
}

export async function deleteEntry(id: string): Promise<void> {
  // Delete the image first
  const entry = await loadEntry(id);
  if (entry?.imageUrl) {
    await deleteImage(entry.imageUrl);
  }

  const { error } = await getSupabase()
    .from("mistakes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete error:", error);
  }
}

export async function getDueForReview(): Promise<MistakeEntry[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("mistakes")
    .select("*")
    .or(`next_review_at.is.null,next_review_at.lte.${now}`)
    .order("next_review_at", { ascending: true });

  if (error) {
    console.error("Review query error:", error);
    return [];
  }
  return (data || []).map(rowToEntry);
}
