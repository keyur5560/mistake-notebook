// Mistake Notebook — UWorld Content Script
// Smart capture of question, answers, explanation from UWorld pages

const MISTAKE_TYPES = [
  "Misread the question",
  "Didn't know the concept",
  "Knew it but picked wrong answer",
  "Narrowed to 2, picked wrong one",
  "Overthought it",
  "Careless error",
  "Ran out of time",
  "Other",
];

// --- Toast ---

function showToast(message, type = "success") {
  let toast = document.getElementById("mn-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mn-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = type;
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- Smart Page Scraping ---

function scrapeUWorld() {
  const result = {
    questionStem: "",
    answerChoices: [],
    selectedAnswer: "",
    correctAnswer: "",
    explanation: "",
    fullText: "",
  };

  // Strategy: grab ALL text content from the page body, then try to
  // intelligently parse it into sections. UWorld's DOM changes frequently,
  // so we rely on text patterns rather than specific selectors.

  const body = document.body.innerText || "";

  // 1. Try to find answer choice patterns (A., B., C., etc.)
  const choicePattern = /^[A-F][.)]\s*.+$/gm;
  const choices = body.match(choicePattern) || [];
  if (choices.length >= 2) {
    result.answerChoices = choices.map((c) => c.trim());
  }

  // 2. Look for elements with visual indicators of correct/incorrect
  //    UWorld typically uses green for correct, red/strikethrough for wrong
  const allElements = document.querySelectorAll("*");
  for (const el of allElements) {
    const style = window.getComputedStyle(el);
    const text = el.innerText?.trim();
    if (!text || text.length < 2 || text.length > 300) continue;

    const bg = style.backgroundColor;
    const color = style.color;
    const decoration = style.textDecoration;

    // Green background or text often indicates correct answer
    if (
      (bg.includes("0, 128") || bg.includes("0, 153") || bg.includes("76, 175") ||
       bg.includes("102, 187") || bg.includes("34, 197") || bg.includes("22, 163") ||
       color.includes("0, 128") || color.includes("34, 197")) &&
      text.match(/^[A-F][.)]\s/)
    ) {
      result.correctAnswer = text;
    }

    // Red or strikethrough often indicates the wrong selected answer
    if (
      (bg.includes("244, 67") || bg.includes("239, 83") || bg.includes("255, 82") ||
       bg.includes("229, 57") || decoration.includes("line-through") ||
       color.includes("244, 67") || color.includes("239, 83")) &&
      text.match(/^[A-F][.)]\s/)
    ) {
      result.selectedAnswer = text;
    }
  }

  // 3. Try to extract question stem — text before answer choices
  if (result.answerChoices.length > 0) {
    const firstChoice = result.answerChoices[0];
    const choiceIdx = body.indexOf(firstChoice);
    if (choiceIdx > 20) {
      result.questionStem = body.substring(0, choiceIdx).trim();
      // Clean up — remove navigation/header junk (usually short lines at the top)
      const lines = result.questionStem.split("\n");
      const meaningfulStart = lines.findIndex((l) => l.trim().length > 40);
      if (meaningfulStart > 0) {
        result.questionStem = lines.slice(meaningfulStart).join("\n").trim();
      }
    }
  }

  // 4. Try to extract explanation — text after "Explanation" or after answer choices
  const explanationMarkers = [
    "Educational Objective",
    "Explanation",
    "Bottom Line",
    "The correct answer is",
    "This question",
  ];

  for (const marker of explanationMarkers) {
    const idx = body.indexOf(marker);
    if (idx > 0) {
      const explanationText = body.substring(idx, idx + 2000).trim();
      if (explanationText.length > result.explanation.length) {
        result.explanation = explanationText;
      }
    }
  }

  // 5. Also try specific DOM selectors that UWorld has used
  const selectorAttempts = [
    { sel: "[class*='explanat']", field: "explanation" },
    { sel: "[class*='question-stem']", field: "questionStem" },
    { sel: "[class*='questionStem']", field: "questionStem" },
    { sel: "[class*='stem']", field: "questionStem" },
    { sel: "[class*='objective']", field: "explanation" },
  ];

  for (const { sel, field } of selectorAttempts) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 30) {
      if (!result[field] || el.innerText.trim().length > result[field].length) {
        result[field] = el.innerText.trim();
      }
    }
  }

  // 6. Build full text combining everything
  const parts = [];
  if (result.questionStem) {
    parts.push("=== QUESTION ===\n" + result.questionStem);
  }
  if (result.answerChoices.length > 0) {
    parts.push("=== ANSWER CHOICES ===\n" + result.answerChoices.join("\n"));
  }
  if (result.selectedAnswer) {
    parts.push("=== SELECTED (WRONG) ===\n" + result.selectedAnswer);
  }
  if (result.correctAnswer) {
    parts.push("=== CORRECT ANSWER ===\n" + result.correctAnswer);
  }
  if (result.explanation) {
    parts.push("=== EXPLANATION ===\n" + result.explanation);
  }

  if (parts.length > 0) {
    result.fullText = parts.join("\n\n");
  } else {
    // Fallback: grab selected text or body
    const selected = window.getSelection().toString().trim();
    result.fullText = selected.length > 20 ? selected : body.substring(0, 4000).trim();
  }

  return result;
}

// --- Screenshot ---

async function captureScreenshot() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "capture-screenshot" });
    return response?.dataUrl || "";
  } catch (e) {
    console.error("Screenshot capture failed:", e);
    return "";
  }
}

// --- Modal ---

function createModal(scraped, screenshotDataUrl) {
  const existing = document.getElementById("mn-modal-overlay");
  if (existing) existing.remove();

  // Pre-fill wrong answer from scraping
  const wrongPrefill = scraped.selectedAnswer || "";
  const correctPrefill = scraped.correctAnswer || "";

  // Build preview sections
  let previewHtml = "";
  if (scraped.questionStem) {
    const stem = scraped.questionStem.substring(0, 300) + (scraped.questionStem.length > 300 ? "..." : "");
    previewHtml += `<div class="mn-preview-section"><div class="mn-preview-label">Question</div><div class="mn-preview-text">${stem}</div></div>`;
  }
  if (scraped.answerChoices.length > 0) {
    previewHtml += `<div class="mn-preview-section"><div class="mn-preview-label">Choices</div><div class="mn-preview-text">${scraped.answerChoices.join("<br>")}</div></div>`;
  }
  if (correctPrefill) {
    previewHtml += `<div class="mn-preview-section mn-preview-correct"><div class="mn-preview-label">Correct</div><div class="mn-preview-text">${correctPrefill}</div></div>`;
  }
  if (wrongPrefill) {
    previewHtml += `<div class="mn-preview-section mn-preview-wrong"><div class="mn-preview-label">You Picked</div><div class="mn-preview-text">${wrongPrefill}</div></div>`;
  }
  if (scraped.explanation) {
    const expl = scraped.explanation.substring(0, 300) + (scraped.explanation.length > 300 ? "..." : "");
    previewHtml += `<div class="mn-preview-section"><div class="mn-preview-label">Explanation</div><div class="mn-preview-text">${expl}</div></div>`;
  }

  if (!previewHtml) {
    previewHtml = `<div class="mn-preview-section"><div class="mn-preview-text">${scraped.fullText.substring(0, 500)}${scraped.fullText.length > 500 ? "..." : ""}</div></div>`;
  }

  const screenshotPreview = screenshotDataUrl
    ? `<div class="mn-preview-section"><div class="mn-preview-label">Screenshot captured</div></div>`
    : "";

  const overlay = document.createElement("div");
  overlay.id = "mn-modal-overlay";
  overlay.innerHTML = `
    <div id="mn-modal">
      <h2>Log Mistake to Notebook</h2>

      <div class="mn-captured-preview">
        ${screenshotPreview}
        ${previewHtml}
      </div>

      <label>What I Picked (Wrong Answer)</label>
      <textarea id="mn-wrong" rows="2" placeholder="Which option did you pick and why?">${wrongPrefill}</textarea>

      <label>Why I Got It Wrong</label>
      <textarea id="mn-why" rows="3" placeholder="What tripped you up?"></textarea>

      <label>Type of Mistake</label>
      <select id="mn-type">
        ${MISTAKE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
      </select>

      <div class="mn-btn-row">
        <button class="mn-btn mn-btn-secondary" id="mn-cancel">Cancel</button>
        <button class="mn-btn mn-btn-primary" id="mn-save">Save & Analyze</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  // Close handlers
  document.getElementById("mn-cancel").addEventListener("click", () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 300);
    }
  });

  // Save
  document.getElementById("mn-save").addEventListener("click", async () => {
    const wrongAnswer = document.getElementById("mn-wrong").value;
    const whyWrong = document.getElementById("mn-why").value;
    const mistakeType = document.getElementById("mn-type").value;
    const saveBtn = document.getElementById("mn-save");

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const saveData = {
        extracted_text: scraped.fullText,
        question_stem: scraped.questionStem,
        wrong_answer: wrongAnswer || scraped.selectedAnswer,
        correct_answer: scraped.correctAnswer,
        why_i_got_it_wrong: whyWrong,
        mistake_type: mistakeType,
        explanation: scraped.explanation,
        screenshot: screenshotDataUrl,
      };
      const saved = await saveToSupabase(saveData);

      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 300);
      showToast("Saved! Analyzing...", "success");

      // Run Groq analysis in background
      if (saved?.[0]?.id) {
        analyzeWithGroq(saved[0].id, saveData);
      }
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Analyze";
      showToast("Save failed: " + err.message, "error");
    }
  });
}

// --- Supabase ---

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["supabaseUrl", "supabaseKey", "groqKey", "accessToken", "refreshToken", "userId"],
      resolve
    );
  });
}

async function refreshAccessToken(config) {
  if (!config.refreshToken) return null;

  try {
    const res = await fetch(
      `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: config.refreshToken }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    // Save new tokens
    await new Promise((resolve) => {
      chrome.storage.sync.set(
        {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        },
        resolve
      );
    });

    return data.access_token;
  } catch (e) {
    console.error("Token refresh failed:", e);
    return null;
  }
}

async function getValidConfig() {
  const config = await getConfig();
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("Please configure Supabase in the extension popup first.");
  }
  if (!config.accessToken) {
    throw new Error("Please log in via the extension popup first.");
  }

  // Always try to refresh the token to keep it fresh
  const newToken = await refreshAccessToken(config);
  if (newToken) {
    config.accessToken = newToken;
  }

  return config;
}

async function uploadScreenshot(config, dataUrl) {
  if (!dataUrl) return "";

  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return "";

  const ext = match[1].split("/")[1];
  const base64 = match[2];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const res = await fetch(
    `${config.supabaseUrl}/storage/v1/object/screenshots/${fileName}`,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": match[1],
      },
      body: bytes,
    }
  );

  if (!res.ok) return "";

  return `${config.supabaseUrl}/storage/v1/object/public/screenshots/${fileName}`;
}

async function saveToSupabase(data) {
  const config = await getValidConfig();

  // Upload screenshot if available
  let imageUrl = "";
  if (data.screenshot) {
    imageUrl = await uploadScreenshot(config, data.screenshot);
  }

  const row = {
    user_id: config.userId,
    image_url: imageUrl,
    extracted_text: data.extracted_text || "",
    question_stem: data.question_stem || "",
    wrong_answer: data.wrong_answer || "",
    correct_answer: data.correct_answer || "",
    why_i_got_it_wrong: data.why_i_got_it_wrong || "",
    mistake_type: data.mistake_type || "Other",
    subject: "Pathology",
    organ_system: "Multisystem & General",
    review_count: 0,
    confidence: 1,
    key_learning_point: "",
    mnemonic_or_tip: "",
    topics_to_review: [],
    high_yield_facts: [],
  };

  const res = await fetch(`${config.supabaseUrl}/rest/v1/mistakes`, {
    method: "POST",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  return res.json();
}

// --- Groq Analysis ---

const GROQ_SYSTEM_PROMPT = `You are a USMLE Step 1 study assistant. A student will give you:
1. Text from a medical question they got wrong (likely UWorld)
2. What answer they picked (wrong) and why they think they got it wrong

Use all of this to provide a thorough analysis.

Return a JSON object with these fields:

{
  "title": "A short, descriptive title for this question (5-10 words)",
  "subject": "One of: Anatomy, Biochemistry, Biostatistics & Epidemiology, Behavioral Science, Immunology, Microbiology, Pathology, Pharmacology, Physiology",
  "organ_system": "One of: Cardiovascular, Endocrine, Gastrointestinal, Hematology & Oncology, Musculoskeletal, Neurology & Psychiatry, Renal, Reproductive, Respiratory, Multisystem & General",
  "question_stem": "The core clinical vignette / question stem, cleaned up and formatted clearly",
  "correct_answer": "The correct answer with a clear explanation of WHY it's correct. Include relevant pathophysiology.",
  "why_i_got_it_wrong": "Based on what the student told you about their reasoning, give a targeted analysis of their specific mistake",
  "key_learning_point": "The single most important concept to remember. Be specific and high-yield.",
  "mnemonic_or_tip": "A helpful mnemonic, memory trick, or study tip related to this concept.",
  "topics_to_review": ["List of 3-5 specific, actionable topics"],
  "high_yield_facts": ["List of 2-4 related high-yield facts"]
}

Important:
- Focus your analysis on the student's SPECIFIC mistake — don't be generic
- Be specific and clinically relevant — write as if teaching a student
- Return ONLY valid JSON, no markdown or other formatting`;

async function analyzeWithGroq(entryId, data) {
  const config = await getConfig();
  if (!config.groqKey) return; // no API key, skip silently

  const extractedText = data.extracted_text || "";
  if (extractedText.length < 10) return;

  const parts = [
    "Here is the text from my UWorld question:",
    `\n---\n${extractedText}\n---\n`,
  ];
  if (data.wrong_answer) parts.push(`**What I picked (wrong):** ${data.wrong_answer}`);
  if (data.why_i_got_it_wrong) parts.push(`**Why I think I got it wrong:** ${data.why_i_got_it_wrong}`);
  if (data.mistake_type) parts.push(`**Type of mistake:** ${data.mistake_type}`);
  parts.push("\nPlease analyze this and fill out all the study fields.");

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: GROQ_SYSTEM_PROMPT },
          { role: "user", content: parts.join("\n") },
        ],
        temperature: 0.3,
      }),
    });

    if (!groqRes.ok) return;

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content;
    if (!content) return;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);

    // Update the Supabase record with analysis results
    const updateFields = {};
    const fieldMap = [
      "title", "subject", "organ_system", "question_stem", "correct_answer",
      "why_i_got_it_wrong", "key_learning_point", "mnemonic_or_tip",
      "topics_to_review", "high_yield_facts",
    ];
    for (const f of fieldMap) {
      if (result[f]) updateFields[f] = result[f];
    }

    if (Object.keys(updateFields).length === 0) return;

    await fetch(`${config.supabaseUrl}/rest/v1/mistakes?id=eq.${entryId}`, {
      method: "PATCH",
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateFields),
    });

    showToast("Analysis complete!", "success");
  } catch (e) {
    console.error("Groq analysis error:", e);
    // Don't show error toast — the save already succeeded
  }
}

// --- Floating Button ---

function injectCaptureButton() {
  if (document.getElementById("mn-capture-btn")) return;

  const btn = document.createElement("button");
  btn.id = "mn-capture-btn";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    Log Mistake
  `;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="mn-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Capturing...
    `;

    try {
      // Capture screenshot and scrape page in parallel
      const [screenshot, scraped] = await Promise.all([
        captureScreenshot(),
        Promise.resolve(scrapeUWorld()),
      ]);

      if (scraped.fullText.length < 10 && !screenshot) {
        showToast("Not enough content found. Try on the question review page.", "error");
        return;
      }

      createModal(scraped, screenshot);
    } catch (e) {
      showToast("Capture failed: " + e.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Log Mistake
      `;
    }
  });

  document.body.appendChild(btn);
}

// --- Auto-Capture Detection ---

let autoCapturePending = false; // prevent duplicate triggers

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["autoCapture", "silentMode"], resolve);
  });
}

async function checkForWrongAnswer() {
  if (autoCapturePending) return;
  if (document.getElementById("mn-modal-overlay")) return; // modal already open

  const settings = await getSettings();
  if (!settings.autoCapture) return;

  const scraped = scrapeUWorld();
  // Only trigger if we detected both a wrong and correct answer (i.e., user got it wrong)
  if (!scraped.selectedAnswer || !scraped.correctAnswer) return;

  autoCapturePending = true;

  if (settings.silentMode) {
    // Silent mode: save immediately with default reason, no popup
    try {
      const screenshot = await captureScreenshot();
      const saveData = {
        extracted_text: scraped.fullText,
        question_stem: scraped.questionStem,
        wrong_answer: scraped.selectedAnswer,
        correct_answer: scraped.correctAnswer,
        why_i_got_it_wrong: "",
        mistake_type: "Didn't know the concept",
        explanation: scraped.explanation,
        screenshot,
      };
      const saved = await saveToSupabase(saveData);
      showToast("Mistake auto-logged — analyzing...", "info");
      if (saved?.[0]?.id) {
        analyzeWithGroq(saved[0].id, saveData);
      }
    } catch (e) {
      showToast("Auto-log failed: " + e.message, "error");
    }
  } else {
    // Auto-capture: show the modal
    try {
      const screenshot = await captureScreenshot();
      createModal(scraped, screenshot);
    } catch (e) {
      showToast("Auto-capture failed: " + e.message, "error");
    }
  }
}

// Reset pending flag on URL/page change so next question can trigger
let lastUrl = location.href;

function onPageChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    autoCapturePending = false;
  }
  if (!document.getElementById("mn-capture-btn")) {
    injectCaptureButton();
  }
}

// --- Init ---

// Inject when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectCaptureButton);
} else {
  injectCaptureButton();
}

// Debounced check — wait for DOM to settle after mutations
let checkTimer = null;
function debouncedCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checkForWrongAnswer(), 1500);
}

// Watch for SPA navigation + answer result appearing
const observer = new MutationObserver(() => {
  onPageChange();
  debouncedCheck();
});
observer.observe(document.body, { childList: true, subtree: true });
