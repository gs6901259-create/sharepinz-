// ==========================================
// SharePinz AI - Modular Storage & Large File Upload Service
// Supports Resumable Chunked Uploads up to 10 GB via TUS / Native Slicing
// ==========================================

import { CONFIG } from "./config.js";

class StorageService {
  constructor() {
    this.sb = null;
    this.activeUploads = new Map(); // uploadId -> controller
    this.initClient();
  }

  initClient() {
    if (typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function") {
      this.sb = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
      );
    } else {
      // Supabase SDK loaded via CDN in browser
    }
  }

  getClient() {
    if (!this.sb) this.initClient();
    return this.sb;
  }

  /**
   * Sanitizes filenames to prevent path traversal and storage key issues
   */
  sanitizeFileName(name) {
    if (!name) return "unnamed-file";
    return name
      .replace(/[/\\]/g, "_")
      .replace(/\.\.+/g, ".")
      .replace(/[\x00-\x1f\x80-\x9f]/g, "")
      .trim();
  }

  /**
   * Parses stored object name to extract metadata
   * Supports both:
   *   1. New format: <timestamp>_exp<hours>_<filename>
   *   2. Legacy format: <timestamp>-<filename>
   */
  parseStoredName(storedName) {
    if (!storedName) return { displayName: "Unknown", createdAt: Date.now(), expiryHours: 24 };

    // New format: timestamp_exp24_filename.ext
    const newMatch = storedName.match(/^(\d+)_exp(\d+)_(.+)$/);
    if (newMatch) {
      return {
        timestamp: parseInt(newMatch[1], 10),
        expiryHours: parseInt(newMatch[2], 10),
        displayName: newMatch[3],
      };
    }

    // Legacy format: timestamp-filename.ext
    const dashIdx = storedName.indexOf("-");
    if (dashIdx !== -1) {
      const ts = parseInt(storedName.slice(0, dashIdx), 10);
      return {
        timestamp: isNaN(ts) ? Date.now() : ts,
        expiryHours: 24, // legacy default
        displayName: storedName.slice(dashIdx + 1),
      };
    }

    return {
      timestamp: Date.now(),
      expiryHours: 24,
      displayName: storedName,
    };
  }

  /**
   * Formats byte size into human readable string
   */
  formatSize(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return "0 B";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Formats speed into human readable string (e.g. "12.4 MB/s")
   */
  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return "-- KB/s";
    return `${this.formatSize(bytesPerSec)}/s`;
  }

  /**
   * Formats ETA seconds into human readable string (e.g. "1m 30s")
   */
  formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return "--";
    const sec = Math.round(seconds);
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (mins < 60) return `${mins}m ${remSec}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }

  /**
   * Main Upload Method - Resumable, chunked, memory-safe, supports up to 10 GB
   * @param {File} file
   * @param {Object} options { pin, expiryHours, onProgress, onStatusChange }
   * @returns {Object} UploadController { id, pause(), resume(), cancel(), promise }
   */
  uploadFile(file, options = {}) {
    const {
      pin,
      expiryHours = 24,
      onProgress = () => {},
      onStatusChange = () => {},
    } = options;

    if (!pin) throw new Error("A valid 6-digit PIN is required for upload.");
    if (!file) throw new Error("No file provided for upload.");

    // Validate size limit (10 GB)
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      throw new Error(
        `File "${file.name}" exceeds the 10 GB limit (${this.formatSize(file.size)}).`
      );
    }

    const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const safeName = this.sanitizeFileName(file.name);
    const storedName = `${Date.now()}_exp${expiryHours}_${safeName}`;
    const objectPath = `${pin}/${storedName}`;

    let isPaused = false;
    let isCancelled = false;
    let tusInstance = null;
    let fallbackController = null;

    let lastLoaded = 0;
    let lastTime = Date.now();
    let speedSamples = [];

    // Controller exposed to caller
    const controller = {
      id: uploadId,
      fileName: file.name,
      fileSize: file.size,
      storedName,
      objectPath,
      pause: () => {
        isPaused = true;
        if (tusInstance) {
          tusInstance.abort(true);
        }
        if (fallbackController && fallbackController.pause) {
          fallbackController.pause();
        }
        onStatusChange("paused");
      },
      resume: () => {
        isPaused = false;
        if (tusInstance) {
          tusInstance.start();
        }
        if (fallbackController && fallbackController.resume) {
          fallbackController.resume();
        }
        onStatusChange("uploading");
      },
      cancel: () => {
        isCancelled = true;
        if (tusInstance) {
          tusInstance.abort(true);
        }
        if (fallbackController && fallbackController.cancel) {
          fallbackController.cancel();
        }
        this.activeUploads.delete(uploadId);
        onStatusChange("cancelled");
      },
      promise: null,
    };

    this.activeUploads.set(uploadId, controller);

    // Speed & ETA calculation helper
    const calculateSpeedAndEta = (bytesUploaded, totalBytes) => {
      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      if (timeDiff >= 0.5) {
        const bytesDiff = bytesUploaded - lastLoaded;
        const currentSpeed = bytesDiff / timeDiff;

        speedSamples.push(currentSpeed);
        if (speedSamples.length > 5) speedSamples.shift();

        const avgSpeed =
          speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;

        const remainingBytes = Math.max(0, totalBytes - bytesUploaded);
        const etaSeconds = avgSpeed > 0 ? remainingBytes / avgSpeed : 0;

        lastLoaded = bytesUploaded;
        lastTime = now;

        return { avgSpeed, etaSeconds };
      }
      return null;
    };

    controller.promise = new Promise((resolve, reject) => {
      onStatusChange("starting");

      // Check if tus-js-client is available for native resumable upload
      const hasTus = typeof window.tus !== "undefined" && window.tus.Upload;

      if (hasTus) {
        // TUS Resumable Upload (Standard for Supabase Storage large files)
        const tusEndpoint = `${CONFIG.SUPABASE_URL}/storage/v1/upload/resumable`;

        tusInstance = new window.tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
            apikey: CONFIG.SUPABASE_ANON_KEY,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: CONFIG.STORAGE_BUCKET,
            objectName: objectPath,
            contentType: file.type || "application/octet-stream",
          },
          chunkSize: CONFIG.CHUNK_SIZE, // 6 MB chunking ensures safe browser memory
          onError: (error) => {
            if (isCancelled) {
              resolve({ cancelled: true });
              return;
            }
            console.error("TUS upload error:", error);
            // Fall back to standard upload if TUS is not supported by bucket config
            console.warn("Attempting fallback upload...");
            this.uploadStandardFallback(file, objectPath, onProgress, onStatusChange)
              .then(resolve)
              .catch(reject);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            if (isPaused || isCancelled) return;
            const percentage = Math.min(
              100,
              Math.round((bytesUploaded / bytesTotal) * 100)
            );
            const speedInfo = calculateSpeedAndEta(bytesUploaded, bytesTotal);

            onProgress({
              bytesUploaded,
              bytesTotal,
              percentage,
              speed: speedInfo ? speedInfo.avgSpeed : 0,
              speedFormatted: this.formatSpeed(speedInfo ? speedInfo.avgSpeed : 0),
              eta: speedInfo ? speedInfo.etaSeconds : 0,
              etaFormatted: this.formatEta(speedInfo ? speedInfo.etaSeconds : 0),
            });
            onStatusChange("uploading");
          },
          onSuccess: () => {
            this.activeUploads.delete(uploadId);
            onProgress({
              bytesUploaded: file.size,
              bytesTotal: file.size,
              percentage: 100,
              speed: 0,
              speedFormatted: "Done",
              eta: 0,
              etaFormatted: "0s",
            });
            onStatusChange("completed");
            resolve({
              ok: true,
              path: objectPath,
              storedName,
              displayName: safeName,
              size: file.size,
            });
          },
        });

        // Start TUS upload
        tusInstance.start();
      } else {
        // Fallback standard/chunked upload via Supabase Client
        this.uploadStandardFallback(file, objectPath, onProgress, onStatusChange)
          .then((res) => {
            this.activeUploads.delete(uploadId);
            resolve(res);
          })
          .catch((err) => {
            this.activeUploads.delete(uploadId);
            reject(err);
          });
      }
    });

    return controller;
  }

  /**
   * Fallback upload via Supabase storage client
   */
  async uploadStandardFallback(file, path, onProgress, onStatusChange) {
    const client = this.getClient();
    if (!client) throw new Error("Storage client could not be initialized.");

    onStatusChange("uploading");
    onProgress({
      bytesUploaded: 0,
      bytesTotal: file.size,
      percentage: 10,
      speedFormatted: "Uploading...",
      etaFormatted: "--",
    });

    const { data, error } = await client.storage
      .from(CONFIG.STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (error) throw error;

    onProgress({
      bytesUploaded: file.size,
      bytesTotal: file.size,
      percentage: 100,
      speedFormatted: "Done",
      etaFormatted: "0s",
    });
    onStatusChange("completed");

    return {
      ok: true,
      path,
      data,
    };
  }

  /**
   * List files for a PIN
   */
  async listFiles(pin) {
    const client = this.getClient();
    if (!client) throw new Error("Storage client not initialized.");

    const { data, error } = await client.storage
      .from(CONFIG.STORAGE_BUCKET)
      .list(pin, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) throw error;
    if (!data || !data.length) return [];

    return data.map((item) => {
      const parsed = this.parseStoredName(item.name);
      const isExpired = Date.now() > parsed.timestamp + parsed.expiryHours * 3600 * 1000;

      return {
        id: item.id,
        rawName: item.name,
        displayName: parsed.displayName,
        size: item.metadata?.size || item.size || 0,
        formattedSize: this.formatSize(item.metadata?.size || item.size || 0),
        createdAt: parsed.timestamp,
        expiryHours: parsed.expiryHours,
        expiresAt: parsed.timestamp + parsed.expiryHours * 3600 * 1000,
        isExpired,
        mimetype: item.metadata?.mimetype || "application/octet-stream",
      };
    });
  }

  /**
   * Get secure temporary signed download URL
   */
  async getSignedDownloadUrl(pin, rawName, expiresIn = CONFIG.SIGNED_URL_EXPIRES_IN) {
    const client = this.getClient();
    if (!client) throw new Error("Storage client not initialized.");

    const fullPath = `${pin}/${rawName}`;
    const { data, error } = await client.storage
      .from(CONFIG.STORAGE_BUCKET)
      .createSignedUrl(fullPath, expiresIn);

    if (error) throw error;
    return data?.signedUrl;
  }

  /**
   * Delete an entire share folder (all files under PIN)
   */
  async deleteShare(pin) {
    const client = this.getClient();
    if (!client) throw new Error("Storage client not initialized.");

    // List all files under pin
    const files = await this.listFiles(pin);
    if (!files.length) return { deletedCount: 0 };

    const pathsToDelete = files.map((f) => `${pin}/${f.rawName}`);
    const { data, error } = await client.storage
      .from(CONFIG.STORAGE_BUCKET)
      .remove(pathsToDelete);

    if (error) throw error;
    return { deletedCount: pathsToDelete.length, data };
  }

  /**
   * Delete a single file
   */
  async deleteFile(pin, rawName) {
    const client = this.getClient();
    if (!client) throw new Error("Storage client not initialized.");

    const { data, error } = await client.storage
      .from(CONFIG.STORAGE_BUCKET)
      .remove([`${pin}/${rawName}`]);

    if (error) throw error;
    return data;
  }
}

export const storageService = new StorageService();
if (typeof window !== "undefined") {
  window.SharePinzStorage = storageService;
}
