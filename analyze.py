import json
import os
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


SYSTEM_PROMPT = f"""You are a USMLE Step 1 study assistant. A student will give you OCR-extracted text from a screenshot of a medical question they got wrong (likely from UWorld or a similar qbank). The OCR may have errors — use your medical knowledge to interpret and correct it.

Analyze the text and return a JSON object with these fields:

{{
  "subject": "One of: {', '.join(USMLE_SUBJECTS)}",
  "organ_system": "One of: {', '.join(ORGAN_SYSTEMS)}",
  "mistake_type": "Your best guess of why the student likely got this wrong. One of: {', '.join(MISTAKE_TYPES)}",
  "question_stem": "The core clinical vignette / question stem, cleaned up from OCR artifacts and formatted clearly",
  "wrong_answer": "If visible in the text, the answer the student selected (marked wrong). Include the letter and text.",
  "correct_answer": "If visible, the correct answer. Include the letter, text, AND a clear explanation of why it's correct.",
  "why_i_got_it_wrong": "A thoughtful analysis of why a student might get this wrong — common reasoning traps, what's misleading, similar-sounding concepts that cause confusion",
  "key_learning_point": "The single most important concept to remember. Be specific and high-yield. Include the relevant pathophysiology, mechanism, or rule.",
  "mnemonic_or_tip": "A helpful mnemonic, memory trick, or study tip related to this concept. If there's a well-known one, use it. Otherwise create a useful one.",
  "topics_to_review": [
    "List of 3-5 specific, actionable topics the student should review. Be specific — not just 'pharmacology' but 'Beta-blocker selectivity and clinical indications'"
  ],
  "high_yield_facts": [
    "List of 2-4 related high-yield facts that commonly appear on Step 1 alongside this topic"
  ]
}}

Important:
- Clean up any OCR artifacts in the text (broken words, misread characters)
- If you can't determine a field, make your best educated guess based on context
- For mistake_type, consider the difficulty and nature of the question
- Be specific and clinically relevant — write as if teaching a student
- Return ONLY valid JSON, no markdown or other formatting"""


def analyze_with_groq(extracted_text: str) -> dict | None:
    """Send OCR text to Groq for AI analysis and field auto-fill."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key or not extracted_text or len(extracted_text.strip()) < 10:
        return None

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Here is the OCR-extracted text from my UWorld screenshot. Please analyze it and fill out all the study fields:\n\n---\n{extracted_text}\n---",
                },
            ],
            temperature=0.3,
        )

        content = response.choices[0].message.content
        if not content:
            return None

        # Extract JSON from response
        import re
        json_match = re.search(r"\{[\s\S]*\}", content)
        if json_match:
            return json.loads(json_match.group())
        return json.loads(content)
    except Exception as e:
        print(f"Groq analysis error: {e}")
        return None
