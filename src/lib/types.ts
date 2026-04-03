export const USMLE_SUBJECTS = [
  "Anatomy",
  "Biochemistry",
  "Biostatistics & Epidemiology",
  "Behavioral Science",
  "Immunology",
  "Microbiology",
  "Pathology",
  "Pharmacology",
  "Physiology",
] as const;

export const ORGAN_SYSTEMS = [
  "Cardiovascular",
  "Endocrine",
  "Gastrointestinal",
  "Hematology & Oncology",
  "Musculoskeletal",
  "Neurology & Psychiatry",
  "Renal",
  "Reproductive",
  "Respiratory",
  "Multisystem & General",
] as const;

export const MISTAKE_TYPES = [
  "Misread the question",
  "Didn't know the concept",
  "Knew it but picked wrong answer",
  "Narrowed to 2, picked wrong one",
  "Overthought it",
  "Careless error",
  "Ran out of time",
  "Other",
] as const;

export type UsmleSubject = (typeof USMLE_SUBJECTS)[number];
export type OrganSystem = (typeof ORGAN_SYSTEMS)[number];
export type MistakeType = (typeof MISTAKE_TYPES)[number];

export interface MistakeEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  // Image (Supabase Storage public URL)
  imageUrl: string;
  // OCR extracted text
  extractedText: string;
  // Classification
  subject: UsmleSubject;
  organSystem: OrganSystem;
  mistakeType: MistakeType;
  // User notes
  questionStem: string;
  wrongAnswer: string;
  correctAnswer: string;
  whyIGotItWrong: string;
  keyLearningPoint: string;
  mnemonicOrTip: string;
  // AI-generated study suggestions
  topicsToReview: string[];
  highYieldFacts: string[];
  // Review tracking
  reviewCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  confidence: 1 | 2 | 3 | 4 | 5;
}
