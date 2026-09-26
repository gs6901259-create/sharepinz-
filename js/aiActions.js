// ==========================================
// SharePinz AI - Central Action Execution Layer (aiActions)
// Action/Tool architecture connecting AI commands to real application functions
// ==========================================

import { storageService } from "./storageService.js";
import { pinService } from "./pinService.js";

class AiActions {
  constructor() {
    this.appState = null;
    this.uiCallbacks = {};
    this.pendingConfirmations = new Map(); // id -> { action, data, resolve, reject }
  }

  /**
   * Bind application state and UI delegates
   */
  bindApp(appState, uiCallbacks) {
    this.appState = appState;
    this.uiCallbacks = uiCallbacks;
  }

  // ==========================================
  // NAVIGATION ACTIONS
  // ==========================================

  openSend() {
    if (this.uiCallbacks.switchView) {
      this.uiCallbacks.switchView("send");
      return { success: true, message: "Switched to Send view." };
    }
    return { success: false, message: "Send view unavailable." };
  }

  openReceive(pin = "") {
    if (this.uiCallbacks.switchView) {
      this.uiCallbacks.switchView("receive");
      if (pin) {
        this.uiCallbacks.setPinInput(pin);
        this.loadSharedFiles(pin);
      }
      return { success: true, message: "Switched to Receive view." };
    }
    return { success: false, message: "Receive view unavailable." };
  }

  openHome() {
    if (this.uiCallbacks.switchView) {
      this.uiCallbacks.switchView("home");
      return { success: true, message: "Switched to Home." };
    }
    return { success: false, message: "Home view unavailable." };
  }

  openAi() {
    if (this.uiCallbacks.toggleAiPanel) {
      this.uiCallbacks.toggleAiPanel(true);
      return { success: true, message: "Opened AI assistant panel." };
    }
    return { success: false, message: "AI panel unavailable." };
  }

  // ==========================================
  // FILE & UPLOAD ACTIONS
  // ==========================================

  selectFiles() {
    this.openSend();
    if (this.uiCallbacks.triggerFileInput) {
      this.uiCallbacks.triggerFileInput();
      return { success: true, message: "Opening file chooser dialog..." };
    }
    return { success: false, message: "File picker unavailable." };
  }

  startUpload() {
    this.openSend();
    if (!this.appState || !this.appState.filesToUpload || !this.appState.filesToUpload.length) {
      this.selectFiles();
      return {
        success: false,
        requiresInput: true,
        message: "No files selected yet. Opening file picker for you.",
      };
    }

    if (this.uiCallbacks.startUploadProcess) {
      this.uiCallbacks.startUploadProcess();
      return {
        success: true,
        message: `Starting upload for ${this.appState.filesToUpload.length} file(s)...`,
      };
    }
    return { success: false, message: "Upload trigger unavailable." };
  }

  pauseUpload() {
    if (this.appState && this.appState.activeUploadController) {
      this.appState.activeUploadController.pause();
      return { success: true, message: "Upload paused." };
    }
    return { success: false, message: "No active upload to pause." };
  }

  resumeUpload() {
    if (this.appState && this.appState.activeUploadController) {
      this.appState.activeUploadController.resume();
      return { success: true, message: "Upload resumed." };
    }
    return { success: false, message: "No paused upload to resume." };
  }

  cancelUpload(confirmed = false) {
    if (!this.appState || !this.appState.activeUploadController) {
      return { success: false, message: "No active upload to cancel." };
    }

    if (!confirmed) {
      return {
        requiresConfirmation: true,
        actionName: "cancelUpload",
        title: "Cancel Upload",
        message: "Are you sure you want to cancel the current upload?",
        confirmLabel: "Cancel Upload",
      };
    }

    this.appState.activeUploadController.cancel();
    if (this.uiCallbacks.onUploadCancelled) {
      this.uiCallbacks.onUploadCancelled();
    }
    return { success: true, message: "Upload was cancelled." };
  }

  // ==========================================
  // PIN & SHARING ACTIONS
  // ==========================================

  generatePin() {
    const pin = pinService.generateSecurePin();
    if (this.appState) {
      this.appState.currentPin = pin;
    }
    return { success: true, pin, message: `New PIN generated: ${pin}` };
  }

  async copyPin(pin) {
    const targetPin = pin || (this.appState && this.appState.currentPin);
    if (!targetPin) {
      return { success: false, message: "No PIN available to copy." };
    }
    try {
      await navigator.clipboard.writeText(targetPin);
      if (this.uiCallbacks.showToast) {
        this.uiCallbacks.showToast(`PIN ${targetPin} copied to clipboard!`);
      }
      return { success: true, pin: targetPin, message: `PIN ${targetPin} copied!` };
    } catch {
      return { success: false, message: "Could not access clipboard." };
    }
  }

  async copyShareLink(pin) {
    const targetPin = pin || (this.appState && this.appState.currentPin);
    if (!targetPin) {
      return { success: false, message: "No PIN available for link." };
    }
    const url = `${window.location.origin}${window.location.pathname}?pin=${targetPin}`;
    try {
      await navigator.clipboard.writeText(url);
      if (this.uiCallbacks.showToast) {
        this.uiCallbacks.showToast("Share link copied to clipboard!");
      }
      return { success: true, url, message: "Share link copied!" };
    } catch {
      return { success: false, message: "Could not access clipboard." };
    }
  }

  async shareViaDevice(pin) {
    const targetPin = pin || (this.appState && this.appState.currentPin);
    if (!targetPin) {
      return { success: false, message: "No PIN available." };
    }
    const url = `${window.location.origin}${window.location.pathname}?pin=${targetPin}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SharePinz AI File Share",
          text: `Use PIN ${targetPin} to download files securely on SharePinz AI`,
          url,
        });
        return { success: true, message: "Shared via device!" };
      } catch (err) {
        if (err.name !== "AbortError") {
          return this.copyShareLink(targetPin);
        }
        return { success: false, message: "Share cancelled." };
      }
    } else {
      return this.copyShareLink(targetPin);
    }
  }

  // ==========================================
  // RECEIVE & DOWNLOAD ACTIONS
  // ==========================================

  validatePin(pin) {
    return pinService.isValidPin(pin);
  }

  async loadSharedFiles(pin) {
    if (!this.validatePin(pin)) {
      return {
        success: false,
        message: "Please enter a valid 6-digit numeric PIN.",
      };
    }

    const rateCheck = pinService.checkRateLimit();
    if (!rateCheck.allowed) {
      return {
        success: false,
        rateLimited: true,
        message: rateCheck.message,
      };
    }

    try {
      this.openReceive(pin);
      const files = await storageService.listFiles(pin);

      if (!files || !files.length) {
        pinService.recordFailedAttempt();
        if (this.uiCallbacks.setReceiveError) {
          this.uiCallbacks.setReceiveError("No files found for this PIN.");
        }
        return {
          success: false,
          message: `No files found for PIN ${pin}. Please verify the code.`,
        };
      }

      pinService.resetRateLimit();

      if (this.appState) {
        this.appState.foundFiles = files;
        this.appState.currentReceivePin = pin;
      }

      if (this.uiCallbacks.displayFoundFiles) {
        this.uiCallbacks.displayFoundFiles(pin, files);
      }

      const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
      const isExpired = files.some((f) => f.isExpired);

      return {
        success: true,
        pin,
        fileCount: files.length,
        totalBytes,
        totalFormatted: storageService.formatSize(totalBytes),
        isExpired,
        files,
        message: `Found ${files.length} file(s) for PIN ${pin} (${storageService.formatSize(totalBytes)}).`,
      };
    } catch (err) {
      console.error(err);
      return {
        success: false,
        message: `Failed to load files: ${err.message}`,
      };
    }
  }

  async downloadSingleFile(pin, rawName) {
    try {
      const url = await storageService.getSignedDownloadUrl(pin, rawName);
      if (!url) throw new Error("Could not generate secure signed URL.");

      const parsed = storageService.parseStoredName(rawName);
      const a = document.createElement("a");
      a.href = url;
      a.download = parsed.displayName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      return { success: true, fileName: parsed.displayName };
    } catch (err) {
      console.error(err);
      return { success: false, message: `Download failed: ${err.message}` };
    }
  }

  async downloadAll(pin) {
    const targetPin = pin || (this.appState && this.appState.currentReceivePin);
    if (!targetPin) {
      return { success: false, message: "No active PIN loaded." };
    }

    if (this.uiCallbacks.triggerDownloadAll) {
      this.uiCallbacks.triggerDownloadAll();
      return { success: true, message: "Preparing ZIP download of all files..." };
    }
    return { success: false, message: "Download all action not available." };
  }

  filterFiles(queryOrType) {
    if (!this.appState || !this.appState.foundFiles || !this.appState.foundFiles.length) {
      return { success: false, message: "No files currently loaded to filter." };
    }

    const term = (queryOrType || "").toLowerCase().trim();
    let matches = [];

    if (term === "pdf" || term === "pdfs") {
      matches = this.appState.foundFiles.filter((f) =>
        f.displayName.toLowerCase().endsWith(".pdf")
      );
    } else if (
      term === "image" ||
      term === "images" ||
      term === "photos" ||
      term === "pics"
    ) {
      matches = this.appState.foundFiles.filter((f) =>
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.displayName)
      );
    } else if (term === "video" || term === "videos") {
      matches = this.appState.foundFiles.filter((f) =>
        /\.(mp4|mov|avi|mkv|webm)$/i.test(f.displayName)
      );
    } else {
      matches = this.appState.foundFiles.filter((f) =>
        f.displayName.toLowerCase().includes(term)
      );
    }

    if (this.uiCallbacks.renderFilteredList) {
      this.uiCallbacks.renderFilteredList(matches);
    }

    return {
      success: true,
      term,
      matchCount: matches.length,
      matches,
      message: `Found ${matches.length} matching file(s) for "${queryOrType}".`,
    };
  }

  async downloadFiltered(queryOrType) {
    const filterResult = this.filterFiles(queryOrType);
    if (!filterResult.success || !filterResult.matches.length) {
      return { success: false, message: `No files found matching "${queryOrType}".` };
    }

    const pin = this.appState.currentReceivePin;
    let downloadedCount = 0;

    for (const file of filterResult.matches) {
      await this.downloadSingleFile(pin, file.rawName);
      downloadedCount++;
    }

    return {
      success: true,
      downloadedCount,
      message: `Downloaded ${downloadedCount} file(s) matching "${queryOrType}".`,
    };
  }

  // ==========================================
  // EXPIRY & MANAGEMENT ACTIONS
  // ==========================================

  setExpiry(hours) {
    const validHours = parseInt(hours, 10);
    if (isNaN(validHours) || validHours <= 0) {
      return { success: false, message: "Invalid expiry duration." };
    }

    if (this.appState) {
      this.appState.selectedExpiryHours = validHours;
    }

    if (this.uiCallbacks.updateExpirySelector) {
      this.uiCallbacks.updateExpirySelector(validHours);
    }

    return {
      success: true,
      hours: validHours,
      message: `Expiry set to ${validHours} hour(s) for the next upload.`,
    };
  }

  getMyShares() {
    const shares = pinService.getMyShares();
    return {
      success: true,
      count: shares.length,
      shares,
      message:
        shares.length > 0
          ? `You have ${shares.length} active or recent sharing session(s).`
          : "You haven't created any shares on this device yet.",
    };
  }

  async deleteShare(pin, confirmed = false) {
    const targetPin =
      pin ||
      (this.appState && this.appState.currentPin) ||
      (this.appState && this.appState.currentReceivePin);

    if (!targetPin) {
      return { success: false, message: "Please specify which PIN to delete." };
    }

    if (!confirmed) {
      return {
        requiresConfirmation: true,
        actionName: "deleteShare",
        targetPin,
        title: "Delete Sharing Session",
        message: `Are you sure you want to permanently delete share PIN ${targetPin}? All associated files will be removed from cloud storage.`,
        confirmLabel: "Delete Share",
      };
    }

    try {
      const res = await storageService.deleteShare(targetPin);
      pinService.removeShareFromHistory(targetPin);

      if (this.appState && this.appState.currentPin === targetPin) {
        this.appState.currentPin = null;
      }
      if (this.appState && this.appState.currentReceivePin === targetPin) {
        this.appState.foundFiles = [];
        this.appState.currentReceivePin = null;
      }

      if (this.uiCallbacks.onShareDeleted) {
        this.uiCallbacks.onShareDeleted(targetPin);
      }

      return {
        success: true,
        deletedCount: res.deletedCount,
        message: `Share PIN ${targetPin} and its files have been permanently deleted.`,
      };
    } catch (err) {
      console.error(err);
      return {
        success: false,
        message: `Failed to delete share: ${err.message}`,
      };
    }
  }

  // ==========================================
  // SMART AI UTILITIES
  // ==========================================

  checkSensitiveFiles(fileList) {
    if (!fileList || !fileList.length) return { hasSensitive: false, warnings: [] };

    const sensitivePatterns = [
      /\.env($|\.)/i,
      /\.pem$/i,
      /\.key$/i,
      /id_rsa/i,
      /credentials/i,
      /secret/i,
      /password/i,
      /\.pfx$/i,
      /\.kdbx$/i,
    ];

    const warnings = [];
    for (const file of fileList) {
      const name = file.name || "";
      for (const pattern of sensitivePatterns) {
        if (pattern.test(name)) {
          warnings.push(`"${name}" appears to contain private keys, passwords, or credentials.`);
          break;
        }
      }
    }

    return {
      hasSensitive: warnings.length > 0,
      warnings,
    };
  }

  async summarizeDocument(pin, rawName) {
    try {
      const url = await storageService.getSignedDownloadUrl(pin, rawName);
      if (!url) throw new Error("Could not access file.");

      const res = await fetch(url);
      const text = await res.text();
      const snippet = text.slice(0, 1000);
      const lineCount = text.split("\n").length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      return {
        success: true,
        fileName: storageService.parseStoredName(rawName).displayName,
        lineCount,
        wordCount,
        preview: snippet,
        message: `Document summary: ~${wordCount} words, ${lineCount} lines.`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Cannot summarize this file format: ${err.message}`,
      };
    }
  }
}

export const aiActions = new AiActions();
if (typeof window !== "undefined") {
  window.SharePinzAiActions = aiActions;
}
