// ==========================================
// SharePinz AI - Persistent Draggable AI Avatar
// Pointer-events dragging, viewport clamping, natural facial expressions, state glow, and smart panel positioning
// ==========================================

import { CONFIG } from "./config.js";

class AiAvatar {
  constructor() {
    this.avatarEl = null;
    this.panelEl = null;
    this.statusBubbleEl = null;
    this.currentState = "idle"; // idle | thinking | success | error | uploading | alert
    this.isDragging = false;
    this.hasDragged = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.elemStartX = 0;
    this.elemStartY = 0;
    this.statusTimeout = null;
    this.isOpen = false;
    this.onTogglePanel = () => {};
  }

  init(container, onTogglePanel) {
    this.onTogglePanel = onTogglePanel;
    this.render(container);
    this.bindEvents();
    this.restorePosition();
  }

  render(container) {
    if (document.getElementById("sharepinz-ai-avatar")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "sharepinz-ai-avatar";
    wrapper.className = "ai-avatar-container state-idle";
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("tabindex", "0");
    wrapper.setAttribute("aria-label", "Open SharePinz AI assistant");
    wrapper.setAttribute("aria-expanded", "false");

    wrapper.innerHTML = `
      <!-- Status Floating Bubble -->
      <div id="aiStatusBubble" class="ai-status-bubble hidden" aria-live="polite">
        <span class="ai-status-text">SharePinz AI ready</span>
      </div>

      <!-- Main Avatar SVG Face -->
      <div class="ai-avatar-orb">
        <div class="ai-pulse-ring"></div>
        <svg class="ai-face-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4f46e5" />
              <stop offset="50%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
            <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#e0e7ff" />
            </linearGradient>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <!-- Avatar Base Orb -->
          <circle cx="50" cy="50" r="44" fill="url(#orbGrad)" />
          
          <!-- Inner Head Plate -->
          <circle cx="50" cy="50" r="38" fill="#1e1b4b" opacity="0.85" />

          <!-- Left Eye -->
          <g class="ai-eye ai-eye-left">
            <ellipse class="ai-eye-white" cx="36" cy="46" rx="6.5" ry="9" fill="url(#eyeGrad)" />
            <circle class="ai-pupil" cx="36" cy="46" r="3.2" fill="#312e81" />
            <circle class="ai-shine" cx="34" cy="43" r="1.5" fill="#ffffff" />
          </g>

          <!-- Right Eye -->
          <g class="ai-eye ai-eye-right">
            <ellipse class="ai-eye-white" cx="64" cy="46" rx="6.5" ry="9" fill="url(#eyeGrad)" />
            <circle class="ai-pupil" cx="64" cy="46" r="3.2" fill="#312e81" />
            <circle class="ai-shine" cx="62" cy="43" r="1.5" fill="#ffffff" />
          </g>

          <!-- Eyebrows for Alert/Thinking expressions -->
          <path class="ai-brow ai-brow-left" d="M 28 34 Q 36 32 42 35" stroke="#a5b4fc" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6" />
          <path class="ai-brow ai-brow-right" d="M 58 35 Q 64 32 72 34" stroke="#a5b4fc" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6" />

          <!-- Cheerful / Friendly AI Smile Mouth -->
          <path class="ai-mouth" d="M 40 64 Q 50 72 60 64" stroke="#e0e7ff" stroke-width="3" stroke-linecap="round" fill="none" />

          <!-- Animated Sparks/Cheeks -->
          <circle class="ai-cheek ai-cheek-left" cx="28" cy="56" r="4" fill="#ec4899" opacity="0.4" />
          <circle class="ai-cheek ai-cheek-right" cx="72" cy="56" r="4" fill="#ec4899" opacity="0.4" />
        </svg>

        <!-- Progress Spinner Ring for Uploading State -->
        <svg class="ai-spinner-svg" viewBox="0 0 100 100">
          <circle class="ai-spinner-track" cx="50" cy="50" r="46" fill="none" stroke-width="3" />
          <circle class="ai-spinner-bar" cx="50" cy="50" r="46" fill="none" stroke-width="3" />
        </svg>

        <!-- Status Mini-Badge Dot -->
        <div class="ai-badge-dot"></div>
      </div>
    `;

    (container || document.body).appendChild(wrapper);
    this.avatarEl = wrapper;
    this.statusBubbleEl = wrapper.querySelector("#aiStatusBubble");
  }

  bindEvents() {
    if (!this.avatarEl) return;

    // Pointer events for robust mouse + touch dragging
    this.avatarEl.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));

    // Keyboard accessibility
    this.avatarEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggleOpen();
      }
    });

    // Auto-adjust positioning on window resize
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.clampToBounds(), 100);
    });
  }

  onPointerDown(e) {
    // Only primary button
    if (e.button !== 0 && e.pointerType === "mouse") return;

    this.isDragging = true;
    this.hasDragged = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    const rect = this.avatarEl.getBoundingClientRect();
    this.elemStartX = rect.left;
    this.elemStartY = rect.top;

    this.avatarEl.classList.add("dragging");
    this.avatarEl.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    // Detect if user intended to drag vs tap
    if (Math.hypot(deltaX, deltaY) > 6) {
      this.hasDragged = true;
    }

    if (this.hasDragged) {
      let newLeft = this.elemStartX + deltaX;
      let newTop = this.elemStartY + deltaY;

      // Clamp to viewport
      const size = this.avatarEl.offsetWidth || 60;
      const margin = 12;
      const maxLeft = window.innerWidth - size - margin;
      const maxTop = window.innerHeight - size - margin;

      newLeft = Math.max(margin, Math.min(newLeft, maxLeft));
      newTop = Math.max(margin, Math.min(newTop, maxTop));

      this.avatarEl.style.left = `${newLeft}px`;
      this.avatarEl.style.top = `${newTop}px`;
      this.avatarEl.style.right = "auto";
      this.avatarEl.style.bottom = "auto";

      // If panel is open, reposition panel
      if (this.isOpen) {
        this.repositionPanel();
      }
    }
  }

  onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.avatarEl.classList.remove("dragging");

    try {
      this.avatarEl.releasePointerCapture(e.pointerId);
    } catch {}

    if (this.hasDragged) {
      // Save position to localStorage
      this.savePosition();
    } else {
      // It was a tap / click!
      this.toggleOpen();
    }
  }

  toggleOpen() {
    this.isOpen = !this.isOpen;
    this.avatarEl.setAttribute("aria-expanded", this.isOpen ? "true" : "false");
    this.onTogglePanel(this.isOpen);
    if (this.isOpen) {
      this.repositionPanel();
    }
  }

  setPanelElement(panelEl) {
    this.panelEl = panelEl;
  }

  /**
   * Intelligently positions the assistant panel near the avatar without overflowing the screen
   */
  repositionPanel() {
    if (!this.panelEl || !this.avatarEl) return;

    const avatarRect = this.avatarEl.getBoundingClientRect();
    const panelWidth = Math.min(380, window.innerWidth - 32);
    const panelHeight = Math.min(520, window.innerHeight - 32);
    const margin = 16;

    let left = avatarRect.left - panelWidth + avatarRect.width;
    let top = avatarRect.top - panelHeight - 12;

    // Boundary check Horizontal
    if (left < margin) {
      left = avatarRect.left;
    }
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin;
    }

    // Boundary check Vertical (open down if avatar is near top)
    if (top < margin) {
      top = avatarRect.bottom + 12;
    }
    if (top + panelHeight > window.innerHeight - margin) {
      top = window.innerHeight - panelHeight - margin;
    }

    this.panelEl.style.left = `${Math.max(margin, left)}px`;
    this.panelEl.style.top = `${Math.max(margin, top)}px`;
  }

  /**
   * Set visual expression and glow state
   * @param {'idle' | 'thinking' | 'success' | 'error' | 'uploading' | 'alert'} state
   */
  setState(state) {
    if (!this.avatarEl) return;
    this.avatarEl.classList.remove(
      "state-idle",
      "state-thinking",
      "state-success",
      "state-error",
      "state-uploading",
      "state-alert"
    );
    this.currentState = state;
    this.avatarEl.classList.add(`state-${state}`);
  }

  /**
   * Display a status notification bubble next to the avatar
   */
  showStatus(text, durationMs = 3500) {
    if (!this.statusBubbleEl) return;
    clearTimeout(this.statusTimeout);

    const textEl = this.statusBubbleEl.querySelector(".ai-status-text");
    if (textEl) textEl.textContent = text;

    this.statusBubbleEl.classList.remove("hidden");
    this.statusBubbleEl.classList.add("visible");

    this.statusTimeout = setTimeout(() => {
      this.statusBubbleEl.classList.remove("visible");
      setTimeout(() => this.statusBubbleEl.classList.add("hidden"), 300);
    }, durationMs);
  }

  savePosition() {
    if (!this.avatarEl) return;
    const rect = this.avatarEl.getBoundingClientRect();
    const pos = {
      xRatio: rect.left / window.innerWidth,
      yRatio: rect.top / window.innerHeight,
    };
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.AVATAR_POS, JSON.stringify(pos));
    } catch {}
  }

  restorePosition() {
    if (!this.avatarEl) return;
    const margin = 20;
    const size = 64;

    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.AVATAR_POS);
      if (raw) {
        const pos = JSON.parse(raw);
        let left = pos.xRatio * window.innerWidth;
        let top = pos.yRatio * window.innerHeight;

        left = Math.max(margin, Math.min(left, window.innerWidth - size - margin));
        top = Math.max(margin, Math.min(top, window.innerHeight - size - margin));

        this.avatarEl.style.left = `${left}px`;
        this.avatarEl.style.top = `${top}px`;
        this.avatarEl.style.right = "auto";
        this.avatarEl.style.bottom = "auto";
        return;
      }
    } catch {}

    // Default: Bottom Right with safe margin
    this.avatarEl.style.right = "24px";
    this.avatarEl.style.bottom = "24px";
    this.avatarEl.style.left = "auto";
    this.avatarEl.style.top = "auto";
  }

  clampToBounds() {
    if (!this.avatarEl) return;
    const rect = this.avatarEl.getBoundingClientRect();
    const size = this.avatarEl.offsetWidth || 64;
    const margin = 16;

    let left = rect.left;
    let top = rect.top;

    const maxLeft = window.innerWidth - size - margin;
    const maxTop = window.innerHeight - size - margin;

    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));

    this.avatarEl.style.left = `${left}px`;
    this.avatarEl.style.top = `${top}px`;
    this.avatarEl.style.right = "auto";
    this.avatarEl.style.bottom = "auto";

    if (this.isOpen) {
      this.repositionPanel();
    }
  }
}

export const aiAvatar = new AiAvatar();
if (typeof window !== "undefined") {
  window.SharePinzAvatar = aiAvatar;
}
