// Mistake Notebook — UWorld Content Script
// Captures question text from the current page and lets the user log their mistake

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

// --- Helpers ---

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
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function getPageText() {
  // Try to grab meaningful text from the page
  // UWorld uses various selectors — we grab the main content area
  const selectors = [
    ".question-stem",
    ".question_text",
    "[class*='question']",
    "[class*='stem']",
    ".explanation",
    "[class*='explanation']",
    "main",
    ".content",
    "article",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 30) {
      return el.innerText.trim();
    }
  }

  // Fallback: grab selected text or visible body text
  const selected = window.getSelection().toString().trim();
  if (selected.length > 20) return selected;

  // Last resort: grab a chunk of body text
  const body = document.body.innerText;
  return body.substring(0, 3000).trim();
}

// --- Modal ---

function createModal(capturedText) {
  // Remove existing
  const existing = document.getElementById("mn-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "mn-modal-overlay";
  overlay.innerHTML = `
    <div id="mn-modal">
      <h2>Log Mistake to Notebook</h2>

      <label>Captured Text</label>
      <div class="mn-extracted">${capturedText.substring(0, 500)}${capturedText.length > 500 ? "..." : ""}</div>

      <label>What I Picked (Wrong Answer)</label>
      <textarea id="mn-wrong" rows="3" placeholder="Which option did you pick and why?"></textarea>

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

  // Events
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

  document.getElementById("mn-save").addEventListener("click", async () => {
    const wrongAnswer = document.getElementById("mn-wrong").value;
    const whyWrong = document.getElementById("mn-why").value;
    const mistakeType = document.getElementById("mn-type").value;
    const saveBtn = document.getElementById("mn-save");

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      await saveToSupabase({
        extracted_text: capturedText,
        wrong_answer: wrongAnswer,
        why_i_got_it_wrong: whyWrong,
        mistake_type: mistakeType,
      });

      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 300);
      showToast("Saved to Mistake Notebook!", "success");
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
      ["supabaseUrl", "supabaseKey", "accessToken", "userId"],
      resolve
    );
  });
}

async function saveToSupabase(data) {
  const config = await getConfig();
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("Please configure Supabase in the extension popup first.");
  }
  if (!config.accessToken) {
    throw new Error("Please log in via the extension popup first.");
  }

  const row = {
    user_id: config.userId,
    extracted_text: data.extracted_text,
    wrong_answer: data.wrong_answer,
    why_i_got_it_wrong: data.why_i_got_it_wrong,
    mistake_type: data.mistake_type,
    subject: "Pathology", // default — will be updated by Groq analysis in the app
    organ_system: "Multisystem & General",
    review_count: 0,
    confidence: 1,
    question_stem: "",
    correct_answer: "",
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

  btn.addEventListener("click", () => {
    const text = getPageText();
    if (text.length < 10) {
      showToast("Not enough text found on page. Try selecting text first.", "error");
      return;
    }
    createModal(text);
  });

  document.body.appendChild(btn);
}

// Inject when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectCaptureButton);
} else {
  injectCaptureButton();
}
