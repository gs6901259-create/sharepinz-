// ==========================================
// SharePinz AI - Central Application Config
// ==========================================

const env = typeof window !== "undefined" && window.SHAREPINZ_ENV ? window.SHAREPINZ_ENV : {};

export const CONFIG = {
  APP_NAME: "SharePinz AI",
  APP_VERSION: "2.0.0",
  TAGLINE: "Simple, secure, intelligent file sharing.",

  // Supabase Configuration
  SUPABASE_URL: env.SUPABASE_URL || "https://ojxemhrukdzvemrmdxcf.supabase.co",
  SUPABASE_ANON_KEY:
    env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeGVtaHJ1a2R6dmVtcm1keGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDI5NDQsImV4cCI6MjA3ODgxODk0NH0.yLYXt0BzBSDLMF71q8bIJbFg2RrAk-bVMmcU0_xqtYA",
  STORAGE_BUCKET: env.STORAGE_BUCKET || "sharepin-files",
  PIN_TABLE: env.PIN_TABLE || "pins",

  // Upload limits & Chunking Architecture
  MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB per file
  CHUNK_SIZE: 6 * 1024 * 1024,            // 6 MB chunk size for TUS/resumable
  SIGNED_URL_EXPIRES_IN: 3600,             // 1 hour for secure signed downloads

  // Expiry presets (in hours)
  EXPIRY_OPTIONS: [
    { label: "1 hour", hours: 1 },
    { label: "6 hours", hours: 6 },
    { label: "24 hours", hours: 24, isDefault: true },
    { label: "3 days", hours: 72 },
    { label: "7 days", hours: 168 },
  ],

  // Rate Limiting & Security
  MAX_FAILED_PIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 60 * 1000, // 60 seconds

  // Local Storage Keys
  STORAGE_KEYS: {
    THEME: "sharepinz_theme",
    MY_SHARES: "sharepinz_my_shares",
    AVATAR_POS: "sharepinz_avatar_pos",
    RATE_LIMIT: "sharepinz_pin_rate_limit",
    INTRO_SEEN: "sharepinz_intro_seen",
  },
};

if (typeof window !== "undefined") {
  window.SharePinzConfig = CONFIG;
}
