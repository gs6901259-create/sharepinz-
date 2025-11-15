// Simple in-memory storage of file groups by PIN
const state = {
  currentFiles: [],
  groups: {}, // pin -> File[]
};

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadError = document.getElementById("uploadError");
const fileList = document.getElementById("fileList");
const generateBtn = document.getElementById("generateBtn");
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

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function renderFileList() {
  if (!state.currentFiles.length) {
    fileList.classList.add("hidden");
    return;
  }
  fileList.classList.remove("hidden");
  fileList.innerHTML = "";
  state.currentFiles.forEach((file, idx) => {
    const row = document.createElement("div");
    row.className = "file-row";
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    const size = document.createElement("div");
    size.className = "file-size";
    size.textContent = formatSize(file.size);
    row.appendChild(name);
    row.appendChild(size);
    fileList.appendChild(row);
  });
}

function setUploadError(msg) {
  if (!msg) {
    uploadError.classList.add("hidden");
    uploadError.textContent = "";
    return;
  }
  uploadError.textContent = msg;
  uploadError.classList.remove("hidden");
}

function setDownloadError(msg) {
  if (!msg) {
    downloadError.classList.add("hidden");
    downloadError.textContent = "";
    return;
  }
  downloadError.textContent = msg;
  downloadError.classList.remove("hidden");
}

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  const files = Array.from(e.dataTransfer.files || []);
  if (!files.length) return;
  state.currentFiles = files;
  setUploadError("");
  pinBox.classList.add("hidden");
  renderFileList();
});

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  state.currentFiles = files;
  setUploadError("");
  pinBox.classList.add("hidden");
  renderFileList();
});

generateBtn.addEventListener("click", () => {
  if (!state.currentFiles.length) {
    setUploadError("Please select at least one file.");
    return;
  }
  // 6-digit PIN
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  state.groups[pin] = state.currentFiles;
  pinCodeEl.textContent = pin;
  pinBox.classList.remove("hidden");
  setUploadError("");
  alert("PIN generated: " + pin + "\nNote: this demo only works while the page is open.");
});

findBtn.addEventListener("click", () => {
  const code = (codeInput.value || "").replace(/[^0-9]/g, "");
  codeInput.value = code;
  if (code.length !== 6) {
    setDownloadError("Enter a 6-digit PIN");
    foundBox.classList.add("hidden");
    return;
  }
  const files = state.groups[code];
  if (!files || !files.length) {
    setDownloadError("No files found for this PIN in this session.");
    foundBox.classList.add("hidden");
    return;
  }
  setDownloadError("");
  foundBox.classList.remove("hidden");
  fileCountEl.textContent = files.length + " file" + (files.length > 1 ? "s" : "") + " found";
  foundList.innerHTML = "";
  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    const size = document.createElement("div");
    size.className = "file-size";
    size.textContent = formatSize(file.size);
    row.appendChild(name);
    row.appendChild(size);
    row.addEventListener("click", () => downloadSingle(file));
    foundList.appendChild(row);
  });

  downloadAllBtn.onclick = () => downloadAll(files, code);
});

clearBtn.addEventListener("click", () => {
  foundBox.classList.add("hidden");
  codeInput.value = "";
  setDownloadError("");
});

function downloadSingle(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

async function downloadAll(files, pin) {
  if (!files.length) return;
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparing...";
  try {
    const zip = new JSZip();
    for (const file of files) {
      const buf = await file.arrayBuffer();
      zip.file(file.name, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sharepin-" + pin + ".zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  } catch (err) {
    console.error(err);
    alert("Failed to create ZIP. Try downloading files one by one.");
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = "Download All (ZIP)";
  }
}
