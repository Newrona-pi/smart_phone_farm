const fs = require('fs');
const path = require('path');

/**
 * Ensures a directory exists.
 * @param {string} dirPath 
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Returns a timestamp string for directory names.
 * Format: YYYY-MM-DD_HH-mm-ss
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
}

/**
 * Wait for a specified ID to operate (simple sleep).
 * @param {number} ms 
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { ensureDir, getTimestamp, sleep };
