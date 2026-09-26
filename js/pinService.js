// ==========================================
// SharePinz AI - PIN Service
// Secure PIN generation, brute-force rate-limiting, expiry timers, and share history
// ==========================================

import { CONFIG } from "./config.js";
import { storageService } from "./storageService.js";

class PinService {
  constructor() {
    this.rateLimitKey = CONFIG.STORAGE_KEYS.RATE_LIMIT;
    this.mySharesKey = CONFIG.STORAGE_KEYS.MY_SHARES;
  }

  /**
   * Generates a cryptographically strong 6-digit PIN
   */
  generateSecurePin() {
    const cryptoObj = typeof window !== "undefined" ? window.crypto : (typeof crypto !== "undefined" ? crypto : null);
    if (cryptoObj && cryptoObj.getRandomValues) {
      const array = new Uint32Array(1);
      cryptoObj.getRandomValues(array);
      const pin = 100000 + (array[0] % 900000);
      return pin.toString();
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Validates PIN format (strictly 6 numeric digits)
   */
  isValidPin(pin) {
    if (!pin || typeof pin !== "string") return false;
    return /^\d{6}$/.test(pin.trim());
  }

  /**
   * Rate limiting check for brute force protection
   */
  checkRateLimit() {
    try {
      const data = JSON.parse(localStorage.getItem(this.rateLimitKey) || "{}");
      const now = Date.now();

      if (data.lockoutUntil && data.lockoutUntil > now) {
        const waitSeconds = Math.ceil((data.lockoutUntil - now) / 1000);
        return {
          allowed: false,
          waitSeconds,
          message: `Too many failed PIN attempts. Please wait ${waitSeconds}s before trying again.`,
        };
      }

      // Reset if lockout expired
      if (data.lockoutUntil && data.lockoutUntil <= now) {
        localStorage.removeItem(this.rateLimitKey);
        return { allowed: true, remainingAttempts: CONFIG.MAX_FAILED_PIN_ATTEMPTS };
      }

      const attempts = data.attempts || 0;
      const remainingAttempts = Math.max(0, CONFIG.MAX_FAILED_PIN_ATTEMPTS - attempts);

      return {
        allowed: attempts < CONFIG.MAX_FAILED_PIN_ATTEMPTS,
        remainingAttempts,
        waitSeconds: 0,
      };
    } catch {
      return { allowed: true, remainingAttempts: CONFIG.MAX_FAILED_PIN_ATTEMPTS };
    }
  }

  /**
   * Record a failed PIN attempt
   */
  recordFailedAttempt() {
    try {
      const data = JSON.parse(localStorage.getItem(this.rateLimitKey) || "{}");
      const attempts = (data.attempts || 0) + 1;
      const now = Date.now();

      if (attempts >= CONFIG.MAX_FAILED_PIN_ATTEMPTS) {
        const lockoutUntil = now + CONFIG.LOCKOUT_DURATION_MS;
        localStorage.setItem(
          this.rateLimitKey,
          JSON.stringify({ attempts, lockoutUntil })
        );
        return {
          locked: true,
          waitSeconds: Math.ceil(CONFIG.LOCKOUT_DURATION_MS / 1000),
        };
      }

      localStorage.setItem(
        this.rateLimitKey,
        JSON.stringify({ attempts, lockoutUntil: 0 })
      );
      return {
        locked: false,
        remainingAttempts: CONFIG.MAX_FAILED_PIN_ATTEMPTS - attempts,
      };
    } catch {
      return { locked: false, remainingAttempts: 4 };
    }
  }

  /**
   * Reset rate limit upon successful PIN access
   */
  resetRateLimit() {
    try {
      localStorage.removeItem(this.rateLimitKey);
    } catch {}
  }

  /**
   * Record PIN metadata to Supabase table
   */
  async registerPinInDatabase(pin) {
    try {
      const client = storageService.getClient();
      if (!client) return false;

      const { data, error } = await client.from(CONFIG.PIN_TABLE).insert({ pin });
      if (error) {
        console.warn("Notice: PIN table insert:", error.message);
      }
      return true;
    } catch (e) {
      console.warn("Notice: PIN table registration skipped:", e.message);
      return false;
    }
  }

  /**
   * Save share session to local history
   */
  saveShareHistory(shareData) {
    try {
      const shares = this.getMyShares();
      // Remove any existing entry for this PIN
      const filtered = shares.filter((s) => s.pin !== shareData.pin);
      filtered.unshift({
        pin: shareData.pin,
        createdAt: shareData.createdAt || Date.now(),
        expiryHours: shareData.expiryHours || 24,
        expiresAt:
          shareData.expiresAt ||
          (shareData.createdAt || Date.now()) +
            (shareData.expiryHours || 24) * 3600 * 1000,
        files: shareData.files || [],
        totalSize: shareData.totalSize || 0,
      });

      // Keep last 30 shares
      localStorage.setItem(
        this.mySharesKey,
        JSON.stringify(filtered.slice(0, 30))
      );
    } catch (e) {
      console.error("Failed to save share history:", e);
    }
  }

  /**
   * Retrieve list of shares created from this client
   */
  getMyShares() {
    try {
      const raw = localStorage.getItem(this.mySharesKey);
      if (!raw) return [];
      const list = JSON.parse(raw);
      const now = Date.now();
      return list.map((item) => ({
        ...item,
        isExpired: now > item.expiresAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Remove a share from history
   */
  removeShareFromHistory(pin) {
    try {
      const shares = this.getMyShares().filter((s) => s.pin !== pin);
      localStorage.setItem(this.mySharesKey, JSON.stringify(shares));
    } catch {}
  }

  /**
   * Calculate time remaining for expiry
   */
  getRemainingExpiry(expiresAt) {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      return {
        expired: true,
        hours: 0,
        minutes: 0,
        seconds: 0,
        formatted: "Expired",
      };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => n.toString().padStart(2, "0");
    const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return {
      expired: false,
      hours,
      minutes,
      seconds,
      formatted,
    };
  }
}

export const pinService = new PinService();
if (typeof window !== "undefined") {
  window.SharePinzPin = pinService;
}
