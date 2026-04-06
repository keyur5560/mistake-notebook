// --- DOM refs ---
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const configSection = document.getElementById("config-section");
const authSection = document.getElementById("auth-section");
const loggedOut = document.getElementById("logged-out");
const loggedIn = document.getElementById("logged-in");
const userEmailEl = document.getElementById("user-email");

// --- Load saved state ---
chrome.storage.sync.get(
  ["supabaseUrl", "supabaseKey", "accessToken", "userId", "userEmail"],
  (data) => {
    if (data.supabaseUrl) {
      document.getElementById("supabase-url").value = data.supabaseUrl;
    }
    if (data.supabaseKey) {
      document.getElementById("supabase-key").value = data.supabaseKey;
    }

    if (data.supabaseUrl && data.supabaseKey) {
      authSection.classList.add("show");

      if (data.accessToken && data.userEmail) {
        showLoggedIn(data.userEmail);
      } else {
        showLoggedOut();
      }
    } else {
      updateStatus("disconnected", "Configure Supabase connection");
    }
  }
);

// --- Save config ---
document.getElementById("save-config").addEventListener("click", () => {
  const url = document.getElementById("supabase-url").value.trim();
  const key = document.getElementById("supabase-key").value.trim();

  if (!url || !key) {
    updateStatus("disconnected", "Please fill in both fields");
    return;
  }

  chrome.storage.sync.set({ supabaseUrl: url, supabaseKey: key }, () => {
    updateStatus("connected", "Connected to Supabase");
    authSection.classList.add("show");
    showLoggedOut();
  });
});

// --- Login ---
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    updateStatus("disconnected", "Please enter email and password");
    return;
  }

  const config = await getConfig();
  try {
    const res = await fetch(
      `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      updateStatus("disconnected", err.error_description || "Login failed");
      return;
    }

    const data = await res.json();
    chrome.storage.sync.set(
      {
        accessToken: data.access_token,
        userId: data.user.id,
        userEmail: data.user.email,
      },
      () => {
        showLoggedIn(data.user.email);
      }
    );
  } catch (err) {
    updateStatus("disconnected", "Login failed: " + err.message);
  }
});

// --- Logout ---
document.getElementById("logout-btn").addEventListener("click", () => {
  chrome.storage.sync.remove(["accessToken", "userId", "userEmail"], () => {
    showLoggedOut();
    updateStatus("connected", "Logged out");
  });
});

// --- Helpers ---

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["supabaseUrl", "supabaseKey"], resolve);
  });
}

function updateStatus(type, text) {
  statusEl.className = "status " + type;
  statusText.textContent = text;
}

function showLoggedIn(email) {
  loggedOut.style.display = "none";
  loggedIn.style.display = "block";
  userEmailEl.textContent = email;
  updateStatus("connected", "Logged in as " + email);
}

function showLoggedOut() {
  loggedOut.style.display = "block";
  loggedIn.style.display = "none";
  updateStatus("connected", "Connected — please log in");
}
