// src/utils/logger.js
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/pipeline.log');

// Make sure logs folder exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

const logger = {
  info: (msg) => {
    console.log(`ℹ️  ${msg}`);
    writeToFile('INFO', msg);
  },
  success: (msg) => {
    console.log(`✅ ${msg}`);
    writeToFile('SUCCESS', msg);
  },
  warn: (msg) => {
    console.warn(`⚠️  ${msg}`);
    writeToFile('WARN', msg);
  },
  error: (msg) => {
    console.error(`❌ ${msg}`);
    writeToFile('ERROR', msg);
  },
  stage: (num, msg) => {
    console.log(`\n🔷 Stage ${num}: ${msg}`);
    writeToFile('STAGE', `Stage ${num}: ${msg}`);
  }
};

module.exports = logger;