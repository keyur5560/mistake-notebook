from __future__ import annotations
import json
import os
import re
from io import BytesIO
from PIL import Image
from groq import Groq
from db import USMLE_SUBJECTS, ORGAN_SYSTEMS, MISTAKE_TYPES

try:
    import pytesseract
    HAS_TESSERACT = True
except Exception:
    HAS_TESSERACT = False


def extract_text_ocr(image_bytes: bytes) -> str:
    """Extract text from image using Tesseract OCR."""
    if not HAS_TESSERACT:
        return ""
    try:
        img = Image.open(BytesIO(image_bytes))
        return pytesseract.image_to_string(img)
    except Exception as e:
        print(f"OCR error: {e}")
        return ""


SYSTEM_PROMPT = f"""You are a USMLE Step 1 study assistant. A student will give you:
1. OCR-extracted text from a screenshot of a medical question they got wrong (likely UWorld)
2. What answer they picked (wrong) and why they think they got it wrong

Use all of this to provide a thorough analysis. The OCR may have errors — use your medical knowledge to interpret and correct it.

Return a JSON object with these fields:

{{
  "title": "A short, descriptive title for this question (5-10 words). Example: 'Beta-blocker Selectivity in CHF' or 'Renal Tubular Acidosis Type 1 vs Type 2'",
  "subject": "One of: {', '.join(USMLE_SUBJECTS)}",
  "organ_system": "One of: {', '.join(ORGAN_SYSTEMS)}",
  "question_stem": "The core clinical vignette / question stem, cleaned up from OCR artifacts and formatted clearly",
  "correct_answer": "The correct answer with a clear explanation of WHY it's correct. Include relevant pathophysiology.",
  "why_i_got_it_wrong": "Based on what the student told you about their reasoning, give a targeted analysis of their specific mistake — what concept they confused, what they should have noticed, and how to avoid this trap next time",
  "key_learning_point": "The single most important concept to remember. Be specific and high-yield. Include the relevant pathophysiology, mechanism, or rule.",
  "mnemonic_or_tip": "A helpful mnemonic, memory trick, or study tip related to this concept. If there's a well-known one, use it. Otherwise create a useful one.",
  "topics_to_review": [
    "List of 3-5 specific, actionable topics the student should review based on their specific mistake. Be specific — not just 'pharmacology' but 'Beta-blocker selectivity and clinical indications'"
  ],
  "high_yield_facts": [
    "List of 2-4 related high-yield facts that commonly appear on Step 1 alongside this topic"
  ]
}}

Important:
- Clean up any OCR artifacts in the text (broken words, misread characters)
- Focus your analysis on the student's SPECIFIC mistake — don't be generic
- The topics_to_review should target their weakness, not just the general topic
- Be specific and clinically relevant — write as if teaching a student
- Return ONLY valid JSON, no markdown or other formatting"""


def analyze_with_groq(
    extracted_text: str,
    wrong_answer: str = "",
    why_wrong: str = "",
    mistake_type: str = "",
) -> dict | None:
    """Send OCR text + student's input to Groq for targeted analysis."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key or not extracted_text or len(extracted_text.strip()) < 10:
        return None

    # Build user message with their input
    parts = [
        "Here is the OCR-extracted text from my UWorld screenshot:",
        f"\n---\n{extracted_text}\n---\n",
    ]
    if wrong_answer:
        parts.append(f"**What I picked (wrong):** {wrong_answer}")
    if why_wrong:
        parts.append(f"**Why I think I got it wrong:** {why_wrong}")
    if mistake_type:
        parts.append(f"**Type of mistake:** {mistake_type}")

    parts.append("\nPlease analyze this and fill out all the study fields.")
    user_message = "\n".join(parts)

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )

        content = response.choices[0].message.content
        if not content:
            return None

        json_match = re.search(r"\{[\s\S]*\}", content)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(content)
    except Exception as e:
        print(f"Groq analysis error: {e}")
        return None


FLASHCARD_PROMPT = """You are a USMLE Step 1 flashcard generator. Given information about a medical question a student got wrong, generate flashcards that will help them master the underlying concepts.

Create exactly {count} flashcards as a JSON array. Each flashcard should have:
- "front": A clear, specific question (not yes/no — make them think)
- "back": A concise, memorable answer with the key fact

Mix these types of cards:
1. Core concept cards — test the fundamental mechanism/pathology they missed
2. Differentiation cards — "How do you distinguish X from Y?" for commonly confused concepts
3. Clinical application cards — "A patient presents with X, what's the diagnosis/next step?"
4. High-yield association cards — classic buzzwords, lab findings, or pathology links

Rules:
- Make fronts specific enough that there's ONE clear answer
- Keep backs concise (2-3 sentences max) — add a memorable hook when possible
- Focus on what the student SPECIFICALLY got wrong, not generic review
- Include at least one card that directly addresses their mistake
- Cards should be Step 1 difficulty level

Return ONLY a JSON array like:
[
  {{"front": "...", "back": "..."}},
  {{"front": "...", "back": "..."}}
]"""


def generate_flashcards(entry: dict, count: int = 7) -> list[dict]:
    """Generate flashcards based on a mistake entry."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return []

    # Build context from the entry
    context_parts = []
    if entry.get("question_stem"):
        context_parts.append(f"**Question:** {entry['question_stem']}")
    if entry.get("correct_answer"):
        context_parts.append(f"**Correct Answer:** {entry['correct_answer']}")
    if entry.get("wrong_answer"):
        context_parts.append(f"**What student picked (wrong):** {entry['wrong_answer']}")
    if entry.get("why_i_got_it_wrong"):
        context_parts.append(f"**Why they got it wrong:** {entry['why_i_got_it_wrong']}")
    if entry.get("key_learning_point"):
        context_parts.append(f"**Key learning point:** {entry['key_learning_point']}")
    if entry.get("subject"):
        context_parts.append(f"**Subject:** {entry['subject']}")
    if entry.get("organ_system"):
        context_parts.append(f"**Organ System:** {entry['organ_system']}")
    if entry.get("topics_to_review"):
        context_parts.append(f"**Topics to review:** {', '.join(entry['topics_to_review'])}")
    if entry.get("extracted_text"):
        context_parts.append(f"**Raw question text:** {entry['extracted_text'][:500]}")

    if not context_parts:
        return []

    user_message = "Here is the question the student got wrong:\n\n" + "\n".join(context_parts)
    user_message += f"\n\nGenerate {count} flashcards to help them master this topic."

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": FLASHCARD_PROMPT.format(count=count)},
                {"role": "user", "content": user_message},
            ],
            temperature=0.5,
        )

        content = response.choices[0].message.content
        if not content:
            return []

        # Extract JSON array
        match = re.search(r"\[[\s\S]*\]", content)
        if match:
            cards = json.loads(match.group())
            return [c for c in cards if "front" in c and "back" in c]
        return []
    except Exception as e:
        print(f"Flashcard generation error: {e}")
        return []
