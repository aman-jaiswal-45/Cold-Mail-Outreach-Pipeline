const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(stage) {
  return path.join(DATA_DIR, `stage_${stage}_output.json`);
}

function saveStageOutput(stage, data) {
  fs.writeFileSync(getFilePath(stage), JSON.stringify(data, null, 2));
  console.log(chalk.green(`Stage ${stage} output saved — ${data.length} records`));
}

function loadStageOutput(stage) {
  const fp = getFilePath(stage);
  if (fs.existsSync(fp)) {
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch (err) {
      console.warn(chalk.yellow(`Stage ${stage} output file is corrupted. Starting fresh.`));
      return null;
    }
  }
  return null;
}

function stageCompleted(stage) {
  return fs.existsSync(getFilePath(stage));
}

function clearAllState() {
  if (fs.existsSync(DATA_DIR)) {
    fs.readdirSync(DATA_DIR).forEach(f => {
      if (f.endsWith('.json')) {
        fs.unlinkSync(path.join(DATA_DIR, f));
      }
    });
  }
  console.log(chalk.red('Cleared all saved state — starting fresh'));
}

module.exports = {
  saveStageOutput,
  loadStageOutput,
  stageCompleted,
  clearAllState
};