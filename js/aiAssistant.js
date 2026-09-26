// ==========================================
// SharePinz AI - Assistant Core & Natural Language Engine
// Context-aware assistant mapping user intent to real application actions
// ==========================================

import { aiActions } from "./aiActions.js";
import { storageService } from "./storageService.js";

class AiAssistant {
  constructor() {
    this.history = [];
    this.avatarController = null;
    this.speechRecognition = null;
    this.isListening = false;
    this.onMessageRender = () => {};
    this.initSpeechRecognition();
  }

  bindAvatar(avatarController) {
    this.avatarController = avatarController;
  }

  setRenderCallback(callback) {
    this.onMessageRender = callback;
  }

  initSpeechRecognition() {
    if (typeof window === "undefined") return;
    const SpeechRec =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        this.speechRecognition = new SpeechRec();
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = "en-US";
      } catch (e) {
        console.warn("Speech recognition initialization failed:", e);
      }
    }
  }

  /**
   * Returns context-aware quick actions based on current view/screen
   */
  getQuickActions(currentView, appState = {}) {
    if (currentView === "send") {
      const hasFiles = appState.filesToUpload && appState.filesToUpload.length > 0;
      return [
        hasFiles
          ? { label: "Upload Files", prompt: "Upload these files" }
          : { label: "Choose Files", prompt: "Upload a file" },
        { label: "Set Expiry (24h)", prompt: "Make this share expire in 24 hours" },
        { label: "Set Expiry (1h)", prompt: "Make this share expire in 1 hour" },
        { label: "Show My Shares", prompt: "Show my shared files" },
      ];
    }

    if (currentView === "receive") {
      const hasLoaded = appState.foundFiles && appState.foundFiles.length > 0;
      if (hasLoaded) {
        return [
          { label: "Download All", prompt: "Download all files" },
          { label: "Download PDFs", prompt: "Download only PDFs" },
          { label: "Download Images", prompt: "Download only images" },
          { label: "How Many Files?", prompt: "How many files are in this share?" },
        ];
      }
      return [
        { label: "Enter PIN", prompt: "Receive files" },
        { label: "Show My Shares", prompt: "Show my shared files" },
        { label: "Send Files Instead", prompt: "I want to send files" },
      ];
    }

    if (currentView === "pinBox") {
      return [
        { label: "Copy PIN", prompt: "Copy this PIN" },
        { label: "Copy Link", prompt: "Copy share link" },
        { label: "Share via Device", prompt: "Share this via device" },
        { label: "Delete Share", prompt: "Delete this sharing session" },
      ];
    }

    // Default Home Screen
    return [
      { label: "Send Files", prompt: "I want to send files" },
      { label: "Receive Files", prompt: "I want to receive files" },
      { label: "Show My Shares", prompt: "Show my shared files" },
      { label: "What can you do?", prompt: "What can you do?" },
    ];
  }

  /**
   * Processes a user input message and performs real actions
   */
  async processMessage(userText, currentView = "home", appState = {}) {
    const text = userText.trim();
    if (!text) return;

    // Add user message to history
    this.addMessage("user", text);

    if (this.avatarController) {
      this.avatarController.setState("thinking");
      this.avatarController.showStatus("Thinking...");
    }

    try {
      // Natural Language Parsing & Intent Routing
      const response = await this.routeIntent(text, currentView, appState);

      if (response.requiresConfirmation) {
        if (this.avatarController) {
          this.avatarController.setState("alert");
          this.avatarController.showStatus("Confirmation needed");
        }
        this.addMessage("ai", response.message, {
          isConfirmation: true,
          confirmData: response,
        });
        return;
      }

      if (this.avatarController) {
        if (response.isError) {
          this.avatarController.setState("error");
          this.avatarController.showStatus("Action notice");
        } else if (response.isWarning) {
          this.avatarController.setState("alert");
          this.avatarController.showStatus("Security alert");
        } else {
          this.avatarController.setState("success");
          this.avatarController.showStatus("Done");
        }
      }

      this.addMessage("ai", response.replyText, response.extraData || {});
    } catch (err) {
      console.error(err);
      if (this.avatarController) {
        this.avatarController.setState("error");
        this.avatarController.showStatus("Error");
      }
      this.addMessage(
        "ai",
        "Sorry, I encountered an issue executing that command: " + err.message
      );
    }
  }

  /**
   * Natural Language Intent Parser & Router
   */
  async routeIntent(text, currentView, appState) {
    const lower = text.toLowerCase();

    // 1. SEND / UPLOAD INTENTS
    if (
      lower.includes("send these files") ||
      lower.includes("upload these files") ||
      lower.includes("start upload") ||
      lower.includes("upload files")
    ) {
      const res = aiActions.startUpload();
      return {
        replyText: res.message,
        isError: !res.success && !res.requiresInput,
      };
    }

    if (
      lower.includes("upload this file") ||
      lower.includes("upload file") ||
      lower.includes("choose files") ||
      lower.includes("select files") ||
      lower.includes("pick files")
    ) {
      aiActions.selectFiles();
      return {
        replyText: "I've opened the file picker. Select any files (up to 10 GB each) to begin.",
      };
    }

    if (lower.includes("send files") || lower.includes("open send")) {
      aiActions.openSend();
      return {
        replyText: "Switched to the Send Files screen. Drag & drop files or tap to choose.",
      };
    }

    // 2. PAUSE / RESUME / CANCEL UPLOADS
    if (lower.includes("pause upload")) {
      const res = aiActions.pauseUpload();
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("resume upload")) {
      const res = aiActions.resumeUpload();
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("cancel upload")) {
      return aiActions.cancelUpload(false);
    }

    // 3. RECEIVE INTENTS
    if (
      lower.includes("receive files") ||
      lower.includes("open receive") ||
      lower.includes("i want to receive")
    ) {
      aiActions.openReceive();
      return {
        replyText: "Switched to Receive Files. Enter a 6-digit PIN to download shared files.",
      };
    }

    // Direct PIN check (e.g. "show files for pin 123456" or "check pin 123456" or "pin 123456")
    const pinMatch = text.match(/\b\d{6}\b/);
    if (
      pinMatch &&
      (lower.includes("pin") ||
        lower.includes("find") ||
        lower.includes("show") ||
        lower.includes("check") ||
        lower.includes("load") ||
        lower.includes("get"))
    ) {
      const pin = pinMatch[0];
      const res = await aiActions.loadSharedFiles(pin);
      if (res.success) {
        return {
          replyText: `Successfully found ${res.fileCount} file(s) for PIN **${pin}** (${res.totalFormatted}). You can now download individual files or click 'Download All'.`,
          extraData: { files: res.files, pin },
        };
      }
      return {
        replyText: res.message,
        isError: true,
      };
    }

    // 4. DOWNLOAD INTENTS
    if (
      lower.includes("download all") ||
      lower.includes("download everything") ||
      lower.includes("download zip")
    ) {
      const res = await aiActions.downloadAll();
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("download only pdf") || lower.includes("download pdfs")) {
      const res = await aiActions.downloadFiltered("pdf");
      return { replyText: res.message, isError: !res.success };
    }

    if (
      lower.includes("download only image") ||
      lower.includes("download only images") ||
      lower.includes("download images")
    ) {
      const res = await aiActions.downloadFiltered("images");
      return { replyText: res.message, isError: !res.success };
    }

    // 5. FILTER / SEARCH INTENTS
    if (
      lower.includes("find my pdf") ||
      lower.includes("show only pdf") ||
      lower.includes("show pdf")
    ) {
      const res = aiActions.filterFiles("pdf");
      return { replyText: res.message, isError: !res.success };
    }

    if (
      lower.includes("find my image") ||
      lower.includes("show only images") ||
      lower.includes("show images")
    ) {
      const res = aiActions.filterFiles("images");
      return { replyText: res.message, isError: !res.success };
    }

    // 6. PIN GENERATION / COPY INTENTS
    if (lower.includes("generate a pin") || lower.includes("generate pin")) {
      const res = aiActions.generatePin();
      return {
        replyText: `Your secure 6-digit PIN is **${res.pin}**. Select files and upload when ready!`,
      };
    }

    if (lower.includes("copy this pin") || lower.includes("copy pin")) {
      const res = await aiActions.copyPin();
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("copy link") || lower.includes("copy share link")) {
      const res = await aiActions.copyShareLink();
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("share via device") || lower.includes("share this")) {
      const res = await aiActions.shareViaDevice();
      return { replyText: res.message };
    }

    // 7. EXPIRY INTENTS
    const expiryMatch = lower.match(/(?:expire in|expiry to|set expiry)\s*(\d+)\s*(hour|hr|day)/);
    if (expiryMatch) {
      let hours = parseInt(expiryMatch[1], 10);
      if (expiryMatch[2].startsWith("day")) hours *= 24;
      const res = aiActions.setExpiry(hours);
      return { replyText: res.message, isError: !res.success };
    }

    if (lower.includes("which files are expiring soon") || lower.includes("expiring soon")) {
      const shares = aiActions.getMyShares();
      if (!shares.shares || !shares.shares.length) {
        return { replyText: "No active shares found on this device." };
      }
      const active = shares.shares.filter((s) => !s.isExpired);
      if (!active.length) {
        return { replyText: "All previous shares on this device have already expired." };
      }
      const list = active
        .map((s) => {
          const diff = Math.max(0, s.expiresAt - Date.now());
          const hrs = (diff / (3600 * 1000)).toFixed(1);
          return `• PIN **${s.pin}**: ${s.files.length} file(s), expires in ~${hrs}h`;
        })
        .join("\n");
      return { replyText: `Active shares expiring soon:\n\n${list}` };
    }

    // 8. USER SHARES / HISTORY INTENTS
    if (
      lower.includes("show my shared files") ||
      lower.includes("show my files") ||
      lower.includes("my shares") ||
      lower.includes("what files are currently shared")
    ) {
      const res = aiActions.getMyShares();
      if (!res.shares || !res.shares.length) {
        return {
          replyText: "You haven't uploaded any shares on this device yet. Tap 'Send Files' to create your first share!",
        };
      }
      const shareList = res.shares
        .slice(0, 5)
        .map((s) => {
          const status = s.isExpired ? "🔴 Expired" : "🟢 Active";
          const fileNames = s.files ? s.files.map((f) => f.name).join(", ") : "Files";
          return `• **PIN ${s.pin}** (${status}): ${fileNames}`;
        })
        .join("\n");
      return {
        replyText: `Here are your recent sharing sessions:\n\n${shareList}\n\nAsk me "Show files for PIN [number]" to open any of them!`,
      };
    }

    // 9. METADATA & FILE QUESTIONS
    if (
      lower.includes("how many files") ||
      lower.includes("count files")
    ) {
      if (appState.foundFiles && appState.foundFiles.length > 0) {
        return {
          replyText: `There are **${appState.foundFiles.length} file(s)** in this share, with a total size of **${storageService.formatSize(
            appState.foundFiles.reduce((a, b) => a + (b.size || 0), 0)
          )}**.`,
        };
      }
      if (appState.filesToUpload && appState.filesToUpload.length > 0) {
        return {
          replyText: `You have **${appState.filesToUpload.length} file(s)** queued for upload, totalling **${storageService.formatSize(
            appState.filesToUpload.reduce((a, b) => a + (b.size || 0), 0)
          )}**.`,
        };
      }
      return { replyText: "No files are currently loaded or selected." };
    }

    if (lower.includes("how large") || lower.includes("how big") || lower.includes("size")) {
      if (appState.foundFiles && appState.foundFiles.length > 0) {
        const total = appState.foundFiles.reduce((a, b) => a + (b.size || 0), 0);
        return {
          replyText: `The currently loaded share is **${storageService.formatSize(total)}** across ${appState.foundFiles.length} file(s).`,
        };
      }
      if (appState.filesToUpload && appState.filesToUpload.length > 0) {
        const total = appState.filesToUpload.reduce((a, b) => a + (b.size || 0), 0);
        return {
          replyText: `The selected files total **${storageService.formatSize(total)}**.`,
        };
      }
      return { replyText: "No files are currently selected to measure." };
    }

    // 10. DESTRUCTIVE ACTIONS (REQUIRES CONFIRMATION)
    if (
      lower.includes("delete this share") ||
      lower.includes("delete share") ||
      lower.includes("delete sharing session") ||
      lower.includes("revoke share")
    ) {
      return aiActions.deleteShare(null, false);
    }

    // 11. GENERAL HELP / CAPABILITIES
    if (
      lower.includes("what can you do") ||
      lower.includes("help") ||
      lower.includes("capabilities")
    ) {
      return {
        replyText:
          "I am **SharePinz AI**, your intelligent file sharing companion! Here is what I can do:\n\n" +
          "• **Send & Upload**: Select and resumably upload files up to 10 GB\n" +
          "• **Receive & Download**: Find files by 6-digit PIN, download all as ZIP, or filter by file type\n" +
          "• **Manage Shares**: Set custom expiry (1h to 7d), copy PINs, list your past shares, and delete sessions\n" +
          "• **Security**: Screen for sensitive credential files and guard against brute-force attacks\n\n" +
          "Try saying: *'Upload these files'*, *'Find PIN 123456'*, or *'Download only PDFs'*!",
      };
    }

    // Fallback friendly AI response
    return {
      replyText: `I understood: "${text}". I can help you send or receive files, manage your PINs, or download matching documents. Try selecting files or saying "Send files" or "Show my shared files".`,
    };
  }

  /**
   * Execute a confirmed destructive action
   */
  async executeConfirmedAction(confirmData) {
    if (confirmData.actionName === "deleteShare") {
      const res = await aiActions.deleteShare(confirmData.targetPin, true);
      this.addMessage("ai", res.message);
      if (this.avatarController) {
        this.avatarController.setState("success");
        this.avatarController.showStatus("Share Deleted");
      }
      return res;
    }

    if (confirmData.actionName === "cancelUpload") {
      const res = aiActions.cancelUpload(true);
      this.addMessage("ai", res.message);
      if (this.avatarController) {
        this.avatarController.setState("idle");
        this.avatarController.showStatus("Cancelled");
      }
      return res;
    }
  }

  addMessage(sender, text, options = {}) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      sender,
      text,
      timestamp: Date.now(),
      ...options,
    };
    this.history.push(msg);
    this.onMessageRender(msg, this.history);
  }

  /**
   * Start or stop speech recognition
   */
  toggleVoice(onResult, onStatus) {
    if (!this.speechRecognition) {
      onStatus("unsupported");
      return;
    }

    if (this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      onStatus("stopped");
    } else {
      this.speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.isListening = false;
        onResult(transcript);
        onStatus("recognized");
      };

      this.speechRecognition.onerror = (event) => {
        this.isListening = false;
        onStatus("error", event.error);
      };

      this.speechRecognition.onend = () => {
        this.isListening = false;
        onStatus("ended");
      };

      try {
        this.speechRecognition.start();
        this.isListening = true;
        onStatus("listening");
      } catch (err) {
        this.isListening = false;
        onStatus("error", err.message);
      }
    }
  }
}

export const aiAssistant = new AiAssistant();
if (typeof window !== "undefined") {
  window.SharePinzAssistant = aiAssistant;
}
