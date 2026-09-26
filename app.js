// =======================================================
// SharePinz AI - Main Application Coordinator
// Connects UI, StorageService, PinService, AIAssistant, and AIAvatar
// =======================================================

import { CONFIG } from "./js/config.js";
import { storageService } from "./js/storageService.js";
import { pinService } from "./js/pinService.js";
import { aiActions } from "./js/aiActions.js";
import { aiAssistant } from "./js/aiAssistant.js";
import { aiAvatar } from "./js/aiAvatar.js";

// ===============================
// 1. APPLICATION STATE
// ===============================
const appState = {
  currentView: "home", // "home" | "send" | "receive"
  filesToUpload: [],
  selectedExpiryHours: 24,
  currentPin: null,
  activeUploadController: null,
  isUploadPaused: false,
  currentReceivePin: null,
  foundFiles: [],
  activeFilter: "all",
  expiryInterval: null,
};

// ===============================
// 2. DOM ELEMENTS
// ===============================
const introOverlay = document.getElementById("introOverlay");
const brandHomeBtn = document.getElementById("brandHomeBtn");
const navHomeBtn = document.getElementById("navHomeBtn");
const navSendBtn = document.getElementById("navSendBtn");
const navReceiveBtn = document.getElementById("navReceiveBtn");
const themeToggle = document.getElementById("themeToggle");

const homeSection = document.getElementById("homeSection");
const sendSection = document.getElementById("sendSection");
const receiveSection = document.getElementById("receiveSection");

const cardSend = document.getElementById("cardSend");
const cardReceive = document.getElementById("cardReceive");
const cardAi = document.getElementById("cardAi");

const sendBackBtn = document.getElementById("sendBackBtn");
const receiveBackBtn = document.getElementById("receiveBackBtn");

// Sender Elements
const expiryPills = document.querySelectorAll(".expiry-pill");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const securityAlertBox = document.getElementById("securityAlertBox");
const securityAlertText = document.getElementById("securityAlertText");
const uploadError = document.getElementById("uploadError");
const uploadBtn = document.getElementById("uploadBtn");

const uploadProgressCard = document.getElementById("uploadProgressCard");
const progressStatusTitle = document.getElementById("progressStatusTitle");
const progressPctBadge = document.getElementById("progressPctBadge");
const progressBar = document.getElementById("progressBar");
const progressBytesEl = document.getElementById("progressBytesEl");
const progressSpeedEl = document.getElementById("progressSpeedEl");
const progressEtaEl = document.getElementById("progressEtaEl");
const uploadPauseResumeBtn = document.getElementById("uploadPauseResumeBtn");
const uploadCancelBtn = document.getElementById("uploadCancelBtn");

const pinBox = document.getElementById("pinBox");
const pinCodeEl = document.getElementById("pinCode");
const copyPinBtn = document.getElementById("copyPinBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const shareDeviceBtn = document.getElementById("shareDeviceBtn");
const pinBoxExpiry = document.getElementById("pinBoxExpiry");
const qrCodeContainer = document.getElementById("qrCode");

// Receiver Elements
const codeInput = document.getElementById("codeInput");
const findBtn = document.getElementById("findBtn");
const downloadError = document.getElementById("downloadError");
const foundBox = document.getElementById("foundBox");
const fileCountEl = document.getElementById("fileCount");
const foundList = document.getElementById("foundList");
const clearBtn = document.getElementById("clearBtn");
const filterInput = document.getElementById("filterInput");
const filterPills = document.querySelectorAll(".filter-pill");
const pinExpiryBox = document.getElementById("pinExpiryBox");
const pinExpiryTimer = document.getElementById("pinExpiryTimer");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadImagesBtn = document.getElementById("downloadImagesBtn");
const downloadPdfsBtn = document.getElementById("downloadPdfsBtn");

// Confirmation Modal Elements
const confirmModal = document.getElementById("confirmModal");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalDesc = document.getElementById("confirmModalDesc");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmActionBtn = document.getElementById("confirmActionBtn");

// AI Panel Elements
const aiPanel = document.getElementById("aiPanel");
const closeAiPanelBtn = document.getElementById("closeAiPanelBtn");
const aiQuickActions = document.getElementById("aiQuickActions");
const aiChatBody = document.getElementById("aiChatBody");
const aiTypingIndicator = document.getElementById("aiTypingIndicator");
const aiInput = document.getElementById("aiInput");
const aiVoiceBtn = document.getElementById("aiVoiceBtn");
const aiSendBtn = document.getElementById("aiSendBtn");

let activeConfirmCallback = null;

// ===============================
// 3. CINEMATIC INTRO ANIMATION
// ===============================
function initIntro() {
  if (!introOverlay) return;

  const dismissIntro = () => {
    introOverlay.classList.add("fade-out");
    setTimeout(() => {
      introOverlay.remove();
    }, 600);
  };

  // Click / tap to skip immediately
  introOverlay.addEventListener("click", dismissIntro);

  // Auto fade out after 2 seconds
  setTimeout(() => {
    dismissIntro();
  }, 2200);
}

// ===============================
// 4. VIEW NAVIGATION
// ===============================
function switchView(viewName) {
  appState.currentView = viewName;

  // Sections
  homeSection.classList.toggle("active", viewName === "home");
  sendSection.classList.toggle("active", viewName === "send");
  receiveSection.classList.toggle("active", viewName === "receive");

  // Nav Tabs
  navHomeBtn.classList.toggle("active", viewName === "home");
  navSendBtn.classList.toggle("active", viewName === "send");
  navReceiveBtn.classList.toggle("active", viewName === "receive");

  // Refresh AI Quick Actions for current view
  renderAiQuickActions();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Bind Navigation
brandHomeBtn?.addEventListener("click", () => switchView("home"));
navHomeBtn?.addEventListener("click", () => switchView("home"));
navSendBtn?.addEventListener("click", () => switchView("send"));
navReceiveBtn?.addEventListener("click", () => switchView("receive"));

cardSend?.addEventListener("click", () => switchView("send"));
cardReceive?.addEventListener("click", () => switchView("receive"));
cardAi?.addEventListener("click", () => {
  aiAvatar.toggleOpen();
});

sendBackBtn?.addEventListener("click", () => switchView("home"));
receiveBackBtn?.addEventListener("click", () => switchView("home"));

// ===============================
// 5. SEND & LARGE UPLOAD FLOW
// ===============================

// Expiry Pills
expiryPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    expiryPills.forEach((p) => p.classList.remove("selected"));
    pill.classList.add("selected");
    appState.selectedExpiryHours = parseInt(pill.getAttribute("data-hours"), 10);
  });
});

function getFileIcon(name) {
  const lower = name.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/)) return "🖼️";
  if (lower.match(/\.(mp4|mov|avi|mkv|webm)$/)) return "🎬";
  if (lower.match(/\.(mp3|wav|flac|aac|ogg)$/)) return "🎧";
  if (lower.match(/\.(pdf)$/)) return "📄";
  if (lower.match(/\.(zip|rar|7z|tar|gz)$/)) return "🗜️";
  if (lower.match(/\.(doc|docx)$/)) return "📃";
  if (lower.match(/\.(xls|xlsx|csv)$/)) return "📊";
  if (lower.match(/\.(ppt|pptx)$/)) return "📑";
  return "📎";
}

function renderSelectedFiles() {
  if (!fileList) return;
  if (!appState.filesToUpload.length) {
    fileList.classList.add("hidden");
    securityAlertBox?.classList.add("hidden");
    return;
  }

  // Security screen
  const secCheck = aiActions.checkSensitiveFiles(appState.filesToUpload);
  if (secCheck.hasSensitive && securityAlertBox && securityAlertText) {
    securityAlertText.textContent = `Security Notice: ${secCheck.warnings.join(" ")}`;
    securityAlertBox.classList.remove("hidden");
    aiAvatar.setState("alert");
    aiAvatar.showStatus("Sensitive file detected");
  } else {
    securityAlertBox?.classList.add("hidden");
  }

  fileList.classList.remove("hidden");
  fileList.innerHTML = "";

  appState.filesToUpload.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-info-group">
        <span class="file-icon">${getFileIcon(file.name)}</span>
        <span class="file-name" title="${file.name}">${file.name}</span>
      </div>
      <div style="display: flex; align-items: center;">
        <span class="file-size">${storageService.formatSize(file.size)}</span>
        <button type="button" class="btn-file-remove" data-index="${index}" title="Remove file">✕</button>
      </div>
    `;
    fileList.appendChild(row);
  });

  // Remove buttons
  fileList.querySelectorAll(".btn-file-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-index"), 10);
      appState.filesToUpload.splice(idx, 1);
      renderSelectedFiles();
    });
  });
}

// Drag and drop listeners
if (dropZone && fileInput) {
  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag");
    const dropped = Array.from(e.dataTransfer.files);
    handleAddedFiles(dropped);
  });

  fileInput.addEventListener("change", (e) => {
    const selected = Array.from(e.target.files);
    handleAddedFiles(selected);
  });
}

function handleAddedFiles(newFiles) {
  if (!newFiles.length) return;
  // Prevent duplicate files by name and size
  const existingKeys = new Set(
    appState.filesToUpload.map((f) => `${f.name}_${f.size}`)
  );
  for (const f of newFiles) {
    if (!existingKeys.has(`${f.name}_${f.size}`)) {
      appState.filesToUpload.push(f);
      existingKeys.add(`${f.name}_${f.size}`);
    }
  }
  renderSelectedFiles();
  setUploadError("");
}

function setUploadError(msg) {
  if (!uploadError) return;
  uploadError.textContent = msg;
  uploadError.classList.toggle("hidden", !msg);
}

// Upload & Generate PIN Process
async function startUploadProcess() {
  if (!appState.filesToUpload.length) {
    setUploadError("Please select at least one file to upload.");
    return;
  }

  setUploadError("");
  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";
  pinBox?.classList.add("hidden");
  uploadProgressCard?.classList.remove("hidden");

  const pin = pinService.generateSecurePin();
  appState.currentPin = pin;
  appState.isUploadPaused = false;

  aiAvatar.setState("uploading");
  aiAvatar.showStatus(`Uploading ${appState.filesToUpload.length} file(s)...`);

  const totalFiles = appState.filesToUpload.length;
  let completedFiles = 0;
  const uploadedFilesMeta = [];

  try {
    for (let i = 0; i < totalFiles; i++) {
      const file = appState.filesToUpload[i];
      progressStatusTitle.textContent = `Uploading ${i + 1} of ${totalFiles}: ${file.name}`;

      const uploadController = storageService.uploadFile(file, {
        pin,
        expiryHours: appState.selectedExpiryHours,
        onProgress: (p) => {
          progressBar.style.width = `${p.percentage}%`;
          progressPctBadge.textContent = `${p.percentage}%`;
          progressBytesEl.textContent = `${storageService.formatSize(
            p.bytesUploaded
          )} / ${storageService.formatSize(p.bytesTotal)}`;
          progressSpeedEl.textContent = p.speedFormatted;
          progressEtaEl.textContent = `ETA: ${p.etaFormatted}`;
        },
        onStatusChange: (status) => {
          if (status === "paused") {
            uploadPauseResumeBtn.textContent = "Resume";
            appState.isUploadPaused = true;
            aiAvatar.showStatus("Upload paused");
          } else if (status === "uploading") {
            uploadPauseResumeBtn.textContent = "Pause";
            appState.isUploadPaused = false;
          }
        },
      });

      appState.activeUploadController = uploadController;

      // Pause / Resume handler
      uploadPauseResumeBtn.onclick = () => {
        if (appState.isUploadPaused) {
          uploadController.resume();
        } else {
          uploadController.pause();
        }
      };

      // Cancel handler
      uploadCancelBtn.onclick = () => {
        showConfirmation(
          "Cancel Upload",
          "Are you sure you want to cancel the file upload?",
          "Cancel Upload",
          () => {
            uploadController.cancel();
            uploadProgressCard.classList.add("hidden");
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Upload & Generate PIN";
            aiAvatar.setState("idle");
            aiAvatar.showStatus("Upload cancelled");
          }
        );
      };

      const result = await uploadController.promise;
      if (result.cancelled) {
        return;
      }

      completedFiles++;
      uploadedFilesMeta.push({
        name: file.name,
        size: file.size,
      });
    }

    // Register PIN in Database and Local History
    await pinService.registerPinInDatabase(pin);
    pinService.saveShareHistory({
      pin,
      createdAt: Date.now(),
      expiryHours: appState.selectedExpiryHours,
      files: uploadedFilesMeta,
      totalSize: uploadedFilesMeta.reduce((a, b) => a + b.size, 0),
    });

    // Display PIN Box
    if (pinCodeEl && pinBox) {
      pinCodeEl.textContent = pin;
      if (pinBoxExpiry) {
        pinBoxExpiry.textContent = `Expires in ${appState.selectedExpiryHours} hours`;
      }
      pinBox.classList.remove("hidden");
    }

    // Render QR Code
    if (qrCodeContainer && typeof QRCode !== "undefined") {
      qrCodeContainer.innerHTML = "";
      const shareUrl = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
      new QRCode(qrCodeContainer, {
        text: shareUrl,
        width: 130,
        height: 130,
        colorDark: "#1e1b4b",
        colorLight: "#ffffff",
      });
    }

    aiAvatar.setState("success");
    aiAvatar.showStatus(`PIN ${pin} generated!`);
    renderAiQuickActions();

    // Reset selected files
    appState.filesToUpload = [];
    renderSelectedFiles();
    uploadProgressCard.classList.add("hidden");
  } catch (err) {
    console.error(err);
    setUploadError("Upload failed: " + err.message);
    aiAvatar.setState("error");
    aiAvatar.showStatus("Upload failed");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload & Generate PIN";
    appState.activeUploadController = null;
  }
}

uploadBtn?.addEventListener("click", startUploadProcess);

// Copy & Share PIN Actions
copyPinBtn?.addEventListener("click", async () => {
  const pin = pinCodeEl ? pinCodeEl.textContent.trim() : "";
  if (!pin) return;
  await navigator.clipboard.writeText(pin);
  const orig = copyPinBtn.textContent;
  copyPinBtn.textContent = "Copied!";
  aiAvatar.showStatus("PIN copied!");
  setTimeout(() => (copyPinBtn.textContent = orig), 1500);
});

copyLinkBtn?.addEventListener("click", async () => {
  const pin = pinCodeEl ? pinCodeEl.textContent.trim() : "";
  if (!pin) return;
  const url = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
  await navigator.clipboard.writeText(url);
  const orig = copyLinkBtn.textContent;
  copyLinkBtn.textContent = "Link Copied!";
  aiAvatar.showStatus("Link copied!");
  setTimeout(() => (copyLinkBtn.textContent = orig), 1500);
});

shareDeviceBtn?.addEventListener("click", async () => {
  const pin = pinCodeEl ? pinCodeEl.textContent.trim() : "";
  if (!pin) return;
  await aiActions.shareViaDevice(pin);
});

// ===============================
// 6. RECEIVE & DOWNLOAD FLOW
// ===============================
function setDownloadError(msg) {
  if (!downloadError) return;
  downloadError.textContent = msg;
  downloadError.classList.toggle("hidden", !msg);
}

function hidePinExpiryTimer() {
  if (appState.expiryInterval) {
    clearInterval(appState.expiryInterval);
    appState.expiryInterval = null;
  }
  if (pinExpiryBox) pinExpiryBox.classList.add("hidden");
}

function startExpiryCountdown(expiresAt) {
  hidePinExpiryTimer();
  if (!pinExpiryBox || !pinExpiryTimer) return;

  pinExpiryBox.classList.remove("hidden");

  const update = () => {
    const remaining = pinService.getRemainingExpiry(expiresAt);
    if (remaining.expired) {
      pinExpiryTimer.textContent = "EXPIRED";
      pinExpiryBox.classList.add("expired");
      hidePinExpiryTimer();
      setDownloadError("This share has expired and files can no longer be downloaded.");
      if (downloadAllBtn) downloadAllBtn.disabled = true;
    } else {
      pinExpiryTimer.textContent = remaining.formatted;
    }
  };

  update();
  appState.expiryInterval = setInterval(update, 1000);
}

// Find Button
findBtn?.addEventListener("click", () => {
  const pin = codeInput ? codeInput.value.trim() : "";
  if (pin.length !== 6) {
    setDownloadError("Please enter a valid 6-digit PIN.");
    return;
  }
  loadSharedFiles(pin);
});

codeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    findBtn?.click();
  }
});

clearBtn?.addEventListener("click", () => {
  if (foundBox) foundBox.classList.add("hidden");
  setDownloadError("");
  if (codeInput) codeInput.value = "";
  hidePinExpiryTimer();
  appState.foundFiles = [];
  appState.currentReceivePin = null;
});

async function loadSharedFiles(pin) {
  setDownloadError("");
  hidePinExpiryTimer();
  findBtn.disabled = true;
  findBtn.textContent = "Finding...";

  aiAvatar.setState("thinking");
  aiAvatar.showStatus("Finding files...");

  const rateCheck = pinService.checkRateLimit();
  if (!rateCheck.allowed) {
    findBtn.disabled = false;
    findBtn.textContent = "Find Files";
    setDownloadError(rateCheck.message);
    aiAvatar.setState("alert");
    return;
  }

  try {
    const files = await storageService.listFiles(pin);

    if (!files || !files.length) {
      pinService.recordFailedAttempt();
      setDownloadError("No files found for this PIN.");
      foundBox?.classList.add("hidden");
      aiAvatar.setState("error");
      aiAvatar.showStatus("No files found");
      return;
    }

    pinService.resetRateLimit();
    appState.foundFiles = files;
    appState.currentReceivePin = pin;
    appState.activeFilter = "all";

    renderFoundFiles(files);

    // Live countdown timer
    const firstFile = files[0];
    if (firstFile && firstFile.expiresAt) {
      startExpiryCountdown(firstFile.expiresAt);
    }

    aiAvatar.setState("success");
    aiAvatar.showStatus(`${files.length} file(s) found!`);
    renderAiQuickActions();
  } catch (err) {
    console.error(err);
    setDownloadError("Error loading files: " + err.message);
    aiAvatar.setState("error");
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = "Find Files";
  }
}

function renderFoundFiles(files) {
  if (!foundList || !foundBox || !fileCountEl) return;

  foundList.innerHTML = "";
  fileCountEl.textContent = `${files.length} file${files.length > 1 ? "s" : ""} found`;
  foundBox.classList.remove("hidden");

  if (!files.length) {
    foundList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">No matching files</div>`;
    return;
  }

  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-info-group">
        <span class="file-icon">${getFileIcon(file.displayName)}</span>
        <span class="file-name" title="${file.displayName}">${file.displayName}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="file-size">${file.formattedSize}</span>
        <button class="btn small primary btn-dl-single">Download</button>
      </div>
    `;

    row.querySelector(".btn-dl-single").onclick = () => {
      aiActions.downloadSingleFile(appState.currentReceivePin, file.rawName);
    };

    foundList.appendChild(row);
  });
}

// Filter Input & Pills
filterInput?.addEventListener("input", (e) => {
  applyFilter(e.target.value);
});

filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    filterPills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const filterType = pill.getAttribute("data-filter");
    appState.activeFilter = filterType;
    applyFilter(filterInput.value);
  });
});

function applyFilter(searchTerm = "") {
  let list = appState.foundFiles || [];
  const term = searchTerm.toLowerCase().trim();

  // Category filter
  if (appState.activeFilter === "pdf") {
    list = list.filter((f) => f.displayName.toLowerCase().endsWith(".pdf"));
  } else if (appState.activeFilter === "images") {
    list = list.filter((f) =>
      /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.displayName)
    );
  } else if (appState.activeFilter === "videos") {
    list = list.filter((f) =>
      /\.(mp4|mov|avi|mkv|webm)$/i.test(f.displayName)
    );
  }

  // Text search filter
  if (term) {
    list = list.filter((f) => f.displayName.toLowerCase().includes(term));
  }

  renderFoundFiles(list);
}

// Download All ZIP
downloadAllBtn?.addEventListener("click", async () => {
  const pin = appState.currentReceivePin;
  const items = appState.foundFiles;
  if (!pin || !items || !items.length) return;

  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Creating ZIP...";
  aiAvatar.setState("uploading");
  aiAvatar.showStatus("Preparing ZIP download...");

  try {
    const zip = new JSZip();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      downloadAllBtn.textContent = `Zipping ${i + 1}/${items.length}...`;

      const signedUrl = await storageService.getSignedDownloadUrl(pin, item.rawName);
      if (!signedUrl) continue;

      const res = await fetch(signedUrl);
      const blob = await res.blob();
      zip.file(item.displayName, blob);
    }

    downloadAllBtn.textContent = "Compressing...";
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `sharepinz-${pin}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    aiAvatar.setState("success");
    aiAvatar.showStatus("ZIP Download Complete!");
  } catch (err) {
    console.error(err);
    alert("ZIP download failed: " + err.message);
    aiAvatar.setState("error");
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = "Download All (ZIP)";
  }
});

// Category Download Buttons
downloadImagesBtn?.addEventListener("click", () => {
  aiActions.downloadFiltered("images");
});

downloadPdfsBtn?.addEventListener("click", () => {
  aiActions.downloadFiltered("pdf");
});

// ===============================
// 7. CONFIRMATION DIALOG MODAL
// ===============================
function showConfirmation(title, message, confirmLabel, onConfirm) {
  if (!confirmModal) {
    if (confirm(message)) onConfirm();
    return;
  }

  confirmModalTitle.textContent = title;
  confirmModalDesc.textContent = message;
  confirmActionBtn.textContent = confirmLabel || "Confirm";
  activeConfirmCallback = onConfirm;

  confirmModal.showModal();
}

confirmCancelBtn?.addEventListener("click", () => {
  confirmModal.close();
  activeConfirmCallback = null;
});

confirmActionBtn?.addEventListener("click", () => {
  confirmModal.close();
  if (activeConfirmCallback) {
    activeConfirmCallback();
    activeConfirmCallback = null;
  }
});

// ===============================
// 8. AI ASSISTANT & AVATAR BINDINGS
// ===============================

// Bind central actions with UI delegates
aiActions.bindApp(appState, {
  switchView,
  setPinInput: (pin) => {
    if (codeInput) codeInput.value = pin;
  },
  triggerFileInput: () => {
    fileInput?.click();
  },
  startUploadProcess,
  onUploadCancelled: () => {
    uploadProgressCard?.classList.add("hidden");
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload & Generate PIN";
  },
  showToast: (msg) => {
    aiAvatar.showStatus(msg);
  },
  displayFoundFiles: (pin, files) => {
    renderFoundFiles(files);
    const first = files[0];
    if (first && first.expiresAt) {
      startExpiryCountdown(first.expiresAt);
    }
  },
  triggerDownloadAll: () => {
    downloadAllBtn?.click();
  },
  renderFilteredList: (matches) => {
    renderFoundFiles(matches);
  },
  updateExpirySelector: (hours) => {
    expiryPills.forEach((p) => {
      const h = parseInt(p.getAttribute("data-hours"), 10);
      p.classList.toggle("selected", h === hours);
    });
  },
  onShareDeleted: (pin) => {
    if (appState.currentPin === pin && pinBox) {
      pinBox.classList.add("hidden");
    }
    if (appState.currentReceivePin === pin && foundBox) {
      foundBox.classList.add("hidden");
    }
    hidePinExpiryTimer();
  },
});

// Initialize persistent draggable AI Avatar
aiAvatar.init(document.body, (isOpen) => {
  aiPanel.classList.toggle("open", isOpen);
  if (isOpen) {
    renderAiQuickActions();
    aiInput?.focus();
  }
});
aiAvatar.setPanelElement(aiPanel);

// Bind assistant to avatar
aiAssistant.bindAvatar(aiAvatar);

// Render incoming messages in chat panel
aiAssistant.setRenderCallback((newMsg) => {
  aiTypingIndicator?.classList.add("hidden");

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${newMsg.sender}`;

  // Markdown-like bold formatting
  let formatted = newMsg.text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  bubble.innerHTML = formatted;

  // If this message requires user confirmation
  if (newMsg.isConfirmation && newMsg.confirmData) {
    const confirmBox = document.createElement("div");
    confirmBox.className = "chat-confirmation-box";
    confirmBox.innerHTML = `
      <button class="btn small ghost btn-chat-cancel">Cancel</button>
      <button class="btn small danger btn-chat-confirm">${newMsg.confirmData.confirmLabel || "Confirm"}</button>
    `;

    confirmBox.querySelector(".btn-chat-confirm").onclick = async () => {
      confirmBox.remove();
      await aiAssistant.executeConfirmedAction(newMsg.confirmData);
    };

    confirmBox.querySelector(".btn-chat-cancel").onclick = () => {
      confirmBox.remove();
      aiAssistant.addMessage("ai", "Action cancelled.");
      aiAvatar.setState("idle");
    };

    bubble.appendChild(confirmBox);
  }

  aiChatBody.appendChild(bubble);
  aiChatBody.scrollTop = aiChatBody.scrollHeight;
});

// AI Quick Actions renderer
function renderAiQuickActions() {
  if (!aiQuickActions) return;
  aiQuickActions.innerHTML = "";

  const actions = aiAssistant.getQuickActions(appState.currentView, appState);
  actions.forEach((act) => {
    const chip = document.createElement("button");
    chip.className = "quick-action-chip";
    chip.textContent = act.label;
    chip.onclick = () => {
      aiAssistant.processMessage(act.prompt, appState.currentView, appState);
    };
    aiQuickActions.appendChild(chip);
  });
}

// AI Chat Send & Input
function sendUserChatMessage() {
  const text = aiInput?.value.trim();
  if (!text) return;
  aiInput.value = "";
  aiTypingIndicator?.classList.remove("hidden");
  aiAssistant.processMessage(text, appState.currentView, appState);
}

aiSendBtn?.addEventListener("click", sendUserChatMessage);
aiInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendUserChatMessage();
  }
});

closeAiPanelBtn?.addEventListener("click", () => {
  aiAvatar.toggleOpen();
});

// Voice Speech Recognition Button
aiVoiceBtn?.addEventListener("click", () => {
  aiAssistant.toggleVoice(
    (transcript) => {
      if (aiInput) aiInput.value = transcript;
      aiVoiceBtn.classList.remove("recording");
      sendUserChatMessage();
    },
    (status) => {
      if (status === "listening") {
        aiVoiceBtn.classList.add("recording");
        aiAvatar.showStatus("Listening...");
      } else if (status === "unsupported") {
        alert("Speech recognition is not supported in this browser. Please type your message.");
      } else {
        aiVoiceBtn.classList.remove("recording");
      }
    }
  );
});

// ===============================
// 9. DARK / LIGHT THEME TOGGLE
// ===============================
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}

function initTheme() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);

  function updateButtonText() {
    const isDark = document.body.classList.contains("dark");
    if (themeToggle) {
      themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
    }
  }

  updateButtonText();

  themeToggle?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, nextTheme);
    updateButtonText();
  });
}

// ===============================
// 10. URL PARAMETER PIN INIT
// ===============================
function initPinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get("pin");
  if (pin && pinService.isValidPin(pin)) {
    switchView("receive");
    if (codeInput) codeInput.value = pin;
    loadSharedFiles(pin);
  }
}

// ===============================
// 11. INITIALIZATION ON DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  initIntro();
  initTheme();
  renderSelectedFiles();
  initPinFromUrl();
});
