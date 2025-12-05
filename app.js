// ===============================
// 1. SUPABASE CONFIG
// ===============================
// Replace these two lines with YOUR real Supabase values
const SUPABASE_URL = "https://ojxemhrukdzvemrmdxcf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeGVtaHJ1a2R6dmVtcm1keGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDI5NDQsImV4cCI6MjA3ODgxODk0NH0.yLYXt0BzBSDLMF71q8bIJbFg2RrAk-bVMmcU0_xqtYA";
const STORAGE_BUCKET = "sharepin-files";

// Supabase client (from CDN script)
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===============================
// 2. STATE & ELEMENTS
// ===============================
const state = {
  filesToUpload: [],
  foundItems: [],
};

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadError = document.getElementById("uploadError");
const fileList = document.getElementById("fileList");
const uploadBtn = document.getElementById("uploadBtn");
const pinBox = document.getElementById("pinBox");
const pinCodeEl = document.getElementById("pinCode");

const codeInput = document.getElementById("codeInput");
const findBtn = document.getElementById("findBtn");
const downloadError = document.getElementById("downloadError");
const foundBox = document.getElementById("foundBox");
const fileCountEl = document.getElementById("fileCount");
const foundList = document.getElementById("foundList");
const clearBtn = document.getElementById("clearBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");

// ===============================
// 3. HELPERS
// ===============================
function formatSize(bytes) {
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
      <div class="file-name">${file.name}</div>
      <div class="file-size">${formatSize(file.size)}</div>
    `;
    fileList.appendChild(row);
  });
}

// =============== NEW: save metadata for auto-delete ===============
async function saveFileMetadata(path) {
  const { error } = await sb.from("files").insert({
    file_path: path,
  });
  if (error) {
    console.error("Failed to save metadata", error);
    // We don't stop upload if metadata insert fails
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

  const pin = generatePin();

  try {
    for (const file of state.filesToUpload) {
      const storedName = `${Date.now()}-${file.name}`;
      const path = `${pin}/${storedName}`;

      const { error } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(path, file);

      if (error) throw error;

      // Save path in DB for 24h cleanup
      await saveFileMetadata(path);
    }

    pinCodeEl.textContent = pin;
    pinBox.classList.remove("hidden");
    alert("PIN: " + pin + "\nUse this PIN on any device to download.");
  } catch (err) {
    console.error(err);
    setUploadError("Upload failed: " + err.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload & Generate PIN";
  }
});

// ===============================
// 6. LOAD FILES BY PIN
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
});

async function loadFiles(pin) {
  setDownloadError("");

  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .list(pin, { limit: 100 });

  if (error || !data || !data.length) {
    setDownloadError("No files found for this PIN.");
    foundBox.classList.add("hidden");
    return;
  }

  state.foundItems = data;
  foundList.innerHTML = "";
  fileCountEl.textContent = `${data.length} files found`;
  foundBox.classList.remove("hidden");

  data.forEach((item) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-name">${displayNameFromStored(item.name)}</div>
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
// 7. DOWNLOAD SINGLE FILE
// ===============================
async function downloadSingle(pin, storedName) {
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(`${pin}/${storedName}`, 3600);

  if (error) return alert("Download failed.");

  const url = data.signedUrl;
  const a = document.createElement("a");
  a.href = url;
  a.download = displayNameFromStored(storedName);
  a.click();
}

// ===============================
// 8. DOWNLOAD ALL AS ZIP
// ===============================
async function downloadAll(pin, items) {
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparing...";

  const zip = new JSZip();

  for (const item of items) {
    const { data } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(`${pin}/${item.name}`, 3600);

    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();

    zip.file(displayNameFromStored(item.name), arrayBuffer);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(zipBlob);
  a.download = `sharepin-${pin}.zip`;
  a.click();

  downloadAllBtn.disabled = false;
  downloadAllBtn.textContent = "Download All (ZIP)";
}

// ===============================
// 9. DARK / LIGHT THEME TOGGLE
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

document.addEventListener("DOMContentLoaded", initTheme);
