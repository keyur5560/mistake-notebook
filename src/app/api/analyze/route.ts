import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { USMLE_SUBJECTS, ORGAN_SYSTEMS, MISTAKE_TYPES } from "@/lib/types";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT = `You are a USMLE Step 1 study assistant. A student will give you OCR-extracted text from a screenshot of a medical question they got wrong (likely from UWorld or a similar qbank). The OCR may have errors — use your medical knowledge to interpret and correct it.

Analyze the text and return a JSON object with these fields:

{
  "subject": "One of: ${USMLE_SUBJECTS.join(", ")}",
  "organSystem": "One of: ${ORGAN_SYSTEMS.join(", ")}",
  "mistakeType": "Your best guess of why the student likely got this wrong. One of: ${MISTAKE_TYPES.join(", ")}",
  "questionStem": "The core clinical vignette / question stem, cleaned up from OCR artifacts and formatted clearly",
  "wrongAnswer": "If visible in the text, the answer the student selected (marked wrong). Include the letter and text.",
  "correctAnswer": "If visible, the correct answer. Include the letter, text, AND a clear explanation of why it's correct.",
  "whyIGotItWrong": "A thoughtful analysis of why a student might get this wrong — common reasoning traps, what's misleading, similar-sounding concepts that cause confusion",
  "keyLearningPoint": "The single most important concept to remember. Be specific and high-yield. Include the relevant pathophysiology, mechanism, or rule.",
  "mnemonicOrTip": "A helpful mnemonic, memory trick, or study tip related to this concept. If there's a well-known one, use it. Otherwise create a useful one.",
  "topicsToReview": [
    "List of 3-5 specific, actionable topics the student should review. Be specific — not just 'pharmacology' but 'Beta-blocker selectivity and clinical indications'"
  ],
  "highYieldFacts": [
    "List of 2-4 related high-yield facts that commonly appear on Step 1 alongside this topic"
  ]
}

Important:
- Clean up any OCR artifacts in the text (broken words, misread characters)
- If you can't determine a field, make your best educated guess based on context
- For mistakeType, consider the difficulty and nature of the question
- Be specific and clinically relevant — write as if teaching a student
- Return ONLY valid JSON, no markdown or other formatting`;

export async function POST(req: NextRequest) {
  try {
    const { extractedText } = await req.json();

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json(
        { error: "Not enough text extracted from the image. Try a clearer screenshot." },
        { status: 400 }
      );
    }

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the OCR-extracted text from my UWorld screenshot. Please analyze it and fill out all the study fields:\n\n---\n${extractedText}\n---`,
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from Groq" },
        { status: 500 }
      );
    }

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Groq response", raw: content },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("Analysis error:", error);
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
