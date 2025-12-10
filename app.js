// ===============================
// 1. SUPABASE CONFIG
// ===============================
const SUPABASE_URL = "https://ojxemhrukdzvemrmdxcf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeGVtaHJ1a2R6dmVtcm1keGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDI5NDQsImV4cCI6MjA3ODgxODk0NH0.yLYXt0BzBSDLMF71q8bIJbFg2RrAk-bVMmcU0_xqtYA";
const STORAGE_BUCKET = "sharepin-files";
const PIN_TABLE = "sharepinz";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===============================
// 2. STATE & ELEMENTS
// ===============================
const state = {
  filesToUpload: [],
  foundItems: [],
};

let pinCountdownInterval = null;

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadError = document.getElementById("uploadError");
const fileList = document.getElementById("fileList");
const uploadBtn = document.getElementById("uploadBtn");
const pinBox = document.getElementById("pinBox");
const pinCodeEl = document.getElementById("pinCode");

const copyPinBtn = document.getElementById("copyPinBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const qrCodeContainer = document.getElementById("qrCode");

const codeInput = document.getElementById("codeInput");
const findBtn = document.getElementById("findBtn");
const downloadError = document.getElementById("downloadError");
const foundBox = document.getElementById("foundBox");
const fileCountEl = document.getElementById("fileCount");
const foundList = document.getElementById("foundList");
const clearBtn = document.getElementById("clearBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");

const pinExpiryBox = document.getElementById("pinExpiryBox");
const pinExpiryTimer = document.getElementById("pinExpiryTimer");

// ===============================
// 3. HELPERS
// ===============================
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function displayNameFromStored(name) {
  const idx = name.indexOf("-");
  if (idx === -1) return name;
  return name.slice(idx + 1);
}

function setUploadError(msg) {
  uploadError.textContent = msg;
  uploadError.classList.toggle("hidden", !msg);
}

function setDownloadError(msg) {
  downloadError.textContent = msg;
  downloadError.classList.toggle("hidden", !msg);
}

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getFileIcon(name) {
  const lower = name.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/)) return "🖼️";
  if (lower.match(/\.(mp4|mov|avi|mkv|webm)$/)) return "🎬";
  if (lower.match(/\.(mp3|wav|flac|aac|ogg)$/)) return "🎧";
  if (lower.match(/\.(pdf)$/)) return "📄";
  if (lower.match(/\.(zip|rar|7z|tar|gz)$/)) return "🗜️";
  if (lower.match(/\.(doc|docx)$/)) return "📃";
  if (lower.match(/\.(xls|xlsx)$/)) return "📊";
  if (lower.match(/\.(ppt|pptx)$/)) return "📑";
  return "📎";
}

function renderSelectedFiles() {
  if (!state.filesToUpload.length) {
    fileList.classList.add("hidden");
    return;
  }
  fileList.classList.remove("hidden");
  fileList.innerHTML = "";

  state.filesToUpload.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-name">
        <span class="file-icon">${getFileIcon(file.name)}</span>
        ${file.name}
      </div>
      <div class="file-size">${formatSize(file.size)}</div>
    `;
    fileList.appendChild(row);
  });
}

function startPinExpiryCountdown(createdAtIsoString) {
  if (!pinExpiryBox || !pinExpiryTimer || !createdAtIsoString) return;

  if (pinCountdownInterval) {
    clearInterval(pinCountdownInterval);
    pinCountdownInterval = null;
  }

  const createdTime = new Date(createdAtIsoString).getTime();
  const expiryTime = createdTime + 24 * 60 * 60 * 1000;

  function updateTimer() {
    const now = Date.now();
    const diff = expiryTime - now;

    if (diff <= 0) {
      pinExpiryTimer.textContent = "00:00:00";
      pinExpiryBox.textContent =
        "This PIN has expired. Please ask the sender to upload again.";
      clearInterval(pinCountdownInterval);
      pinCountdownInterval = null;
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    pinExpiryTimer.textContent = `${hh}:${mm}:${ss}`;
    pinExpiryBox.classList.remove("hidden");
  }

  updateTimer();
  pinCountdownInterval = setInterval(updateTimer, 1000);
}

function hidePinExpiry() {
  if (pinCountdownInterval) {
    clearInterval(pinCountdownInterval);
    pinCountdownInterval = null;
  }
  if (pinExpiryBox) {
    pinExpiryBox.classList.add("hidden");
    pinExpiryBox.innerHTML = 'PIN expires in <span id="pinExpiryTimer">--:--:--</span>';
    const span = pinExpiryBox.querySelector("span");
    if (span) {
      pinExpiryTimer = span;
    }
  }
}

async function createPinRecord(pin) {
  try {
    const { error } = await sb.from(PIN_TABLE).insert({ pin });
    if (error) {
      console.error("Error saving PIN metadata:", error);
    }
  } catch (e) {
    console.error("Unexpected error saving PIN metadata:", e);
  }
}

// ===============================
// 4. FILE SELECTION
// ===============================
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  state.filesToUpload = Array.from(e.dataTransfer.files);
  renderSelectedFiles();
});

fileInput.addEventListener("change", (e) => {
  state.filesToUpload = Array.from(e.target.files);
  renderSelectedFiles();
});

// ===============================
// 5. UPLOAD TO SUPABASE
// ===============================
uploadBtn.addEventListener("click", async () => {
  if (!state.filesToUpload.length) {
    setUploadError("Select at least one file.");
    return;
  }

  setUploadError("");
  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";

  let pin = generatePin();

  try {
    for (const file of state.filesToUpload) {
      const storedName = `${Date.now()}-${file.name}`;
      const path = `${pin}/${storedName}`;

      const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file);
      if (error) throw error;
    }

    await createPinRecord(pin);

    pinCodeEl.textContent = pin;
    pinBox.classList.remove("hidden");

    if (qrCodeContainer && typeof QRCode !== "undefined") {
      qrCodeContainer.innerHTML = "";
      const url = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
      new QRCode(qrCodeContainer, {
        text: url,
        width: 128,
        height: 128,
      });
    }

    alert("PIN: " + pin + "\nUse this PIN on any device to download (valid for 24 hours).");
  } catch (err) {
    console.error(err);
    setUploadError("Upload failed: " + err.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload & Generate PIN";
  }
});

// ===============================
// 6. COPY PIN / LINK & QR
// ===============================
if (copyPinBtn) {
  copyPinBtn.addEventListener("click", async () => {
    const pin = pinCodeEl.textContent.trim();
    if (!pin || !navigator.clipboard) return;
    await navigator.clipboard.writeText(pin);
    const prev = copyPinBtn.textContent;
    copyPinBtn.textContent = "Copied!";
    setTimeout(() => (copyPinBtn.textContent = prev), 1200);
  });
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", async () => {
    const pin = pinCodeEl.textContent.trim();
    if (!pin || !navigator.clipboard) return;
    const url = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
    await navigator.clipboard.writeText(url);
    const prev = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "Link Copied!";
    setTimeout(() => (copyLinkBtn.textContent = prev), 1200);
  });
}

// ===============================
// 7. LOAD FILES BY PIN
// ===============================
findBtn.addEventListener("click", () => {
  const pin = codeInput.value.trim();
  if (pin.length !== 6) {
    setDownloadError("Enter a valid 6-digit PIN");
    return;
  }
  loadFiles(pin);
});

clearBtn.addEventListener("click", () => {
  foundBox.classList.add("hidden");
  setDownloadError("");
  codeInput.value = "";
  hidePinExpiry();
});

async function loadFiles(pin) {
  setDownloadError("");
  hidePinExpiry();

  // First, check PIN metadata
  try {
    const { data: pinRow, error: pinError } = await sb
      .from(PIN_TABLE)
      .select("*")
      .eq("pin", pin)
      .maybeSingle();

    if (pinError) {
      console.error("Error fetching PIN metadata:", pinError);
    }

    if (!pinRow) {
      setDownloadError("No files found for this PIN or it has expired.");
      foundBox.classList.add("hidden");
      return;
    }

    const createdAt = pinRow.created_at;
    if (createdAt) {
      const createdTime = new Date(createdAt).getTime();
      const expiryTime = createdTime + 24 * 60 * 60 * 1000;
      if (Date.now() > expiryTime) {
        setDownloadError(
          "This PIN has expired (24 hours over). Please ask the sender to upload again."
        );
        foundBox.classList.add("hidden");
        return;
      }
      startPinExpiryCountdown(createdAt);
    }
  } catch (e) {
    console.error("Unexpected error reading PIN metadata:", e);
  }

  // Then, list files in storage
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .list(pin, { limit: 100 });

  if (error || !data || !data.length) {
    console.error(error);
    setDownloadError("No files found for this PIN.");
    foundBox.classList.add("hidden");
    return;
  }

  state.foundItems = data;
  foundList.innerHTML = "";
  fileCountEl.textContent = `${data.length} file${data.length > 1 ? "s" : ""} found`;
  foundBox.classList.remove("hidden");

  data.forEach((item) => {
    const displayName = displayNameFromStored(item.name);
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-name">
        <span class="file-icon">${getFileIcon(displayName)}</span>
        ${displayName}
      </div>
      <div class="file-size">${
        item.metadata?.size ? formatSize(item.metadata.size) : ""
      }</div>
    `;
    row.onclick = () => downloadSingle(pin, item.name);
    foundList.appendChild(row);
  });

  downloadAllBtn.onclick = () => downloadAll(pin, data);
}

// ===============================
// 8. DOWNLOAD SINGLE FILE
// ===============================
async function downloadSingle(pin, storedName) {
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(`${pin}/${storedName}`, 3600);

  if (error) {
    console.error(error);
    alert("Download failed.");
    return;
  }

  const url = data.signedUrl;
  const a = document.createElement("a");
  a.href = url;
  a.download = displayNameFromStored(storedName);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ===============================
// 9. DOWNLOAD ALL AS ZIP
// ===============================
async function downloadAll(pin, items) {
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparing...";

  const zip = new JSZip();

  for (const item of items) {
    const { data, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(`${pin}/${item.name}`, 3600);

    if (error) {
      console.error(error);
      continue;
    }

    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();

    zip.file(displayNameFromStored(item.name), arrayBuffer);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(zipBlob);
  a.download = `sharepin-${pin}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  downloadAllBtn.disabled = false;
  downloadAllBtn.textContent = "Download All (ZIP)";
}

// ===============================
// 10. DARK / LIGHT THEME TOGGLE
// ===============================
const THEME_KEY = "sharepin-theme";

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);

  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  function updateButtonText() {
    const isDark = document.body.classList.contains("dark");
    toggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
  }

  updateButtonText();

  toggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    updateButtonText();
  });
}

// ===============================
// 11. INIT PIN FROM URL (?pin=123456)
// ===============================
function initPinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get("pin");
  if (pin && codeInput) {
    codeInput.value = pin;
    loadFiles(pin);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initPinFromUrl();
});
