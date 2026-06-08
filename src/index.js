require('dotenv').config();
const readline = require('readline');
const chalk = require('chalk');
const logger = require('./utils/logger');
const {delay} = require('./utils/rateLimiter');
const {
  saveStageOutput,
  loadStageOutput,
  stageCompleted,
  clearAllState
} = require('./utils/stateManager');

const { runOcean } = require('./stages/ocean');
const { runProspeo } = require('./stages/prospeo');
const { runProspeoEmail } = require('./stages/prospeoEmail');
const { runBrevo } = require('./stages/brevo');
const { safetyCheckpoint } = require('./utils/checkpoint');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function getSeedDomain() {
  const args = process.argv.slice(2);
  let domain = args.find(a => !a.startsWith('--'));

  if (domain) {
    console.log(chalk.cyan(`Using seed domain from CLI argument: ${domain}`));
    return domain;
  }

  while (!domain) {
    domain = await askQuestion(chalk.cyan.bold('Enter a seed company domain (e.g. stripe.com): '));
    if (!domain) {
      console.log(chalk.red('Seed domain cannot be empty.\n'));
    }
  }
  return domain;
}

async function main() {
  console.log(chalk.blue.bold('\n' + '━'.repeat(60)));
  console.log(chalk.blue.bold(' COLD OUTREACH PIPELINE ENGINE'));
  console.log(chalk.blue.bold('━'.repeat(60) + '\n'));

  const requiredKeys = ['OCEAN_API_KEY', 'PROSPEO_API_KEY', 'BREVO_API_KEY', 'SENDER_EMAIL', 'SENDER_NAME'];
  const missingKeys = requiredKeys.filter(key => !process.env[key]);
  if (missingKeys.length > 0) {
    logger.error(`Missing required environment variables: ${missingKeys.join(', ')}`);
    console.log(chalk.red('Please configure them in your .env file before running.\n'));
    process.exit(1);
  }

  const args       = process.argv.slice(2);
  const freshFlag  = args.includes('--fresh');

  if (freshFlag) {
    clearAllState();
    console.log(chalk.gray('--fresh flag detected — cleared previous run\n'));
  }

  let startFromStage = 1;
  let currentData = null;

  const stage1Done = stageCompleted(1);
  const stage2Done = stageCompleted(2);
  const stage3Done = stageCompleted(3);
  const stage4Done = stageCompleted(4);

  let detectedStage = 0;
  if (stage4Done) detectedStage = 4;
  else if (stage3Done) detectedStage = 3;
  else if (stage2Done) detectedStage = 2;
  else if (stage1Done) detectedStage = 1;

  if (!freshFlag && detectedStage > 0) {
    console.log(chalk.yellow(`Detected existing progress from a previous run (Stage ${detectedStage} complete).`));

    if (detectedStage === 4) {
      const restart = await askQuestion(chalk.cyan('All stages have already completed. Start a fresh run? (yes/no): '));
      if (restart.toLowerCase() === 'yes' || restart.toLowerCase() === 'y') {
        clearAllState();
      } else {
        console.log(chalk.green('\nExiting pipeline. Nothing to do.\n'));
        process.exit(0);
      }
    } else {
      const resume = await askQuestion(chalk.cyan(`Do you want to resume from Stage ${detectedStage + 1}? (yes/no): `));
      if (resume.toLowerCase() === 'yes' || resume.toLowerCase() === 'y') {
        startFromStage = detectedStage + 1;
        currentData = loadStageOutput(detectedStage);
        logger.info(`Resuming from Stage ${startFromStage} using cached data.`);
      } else {
        clearAllState();
        startFromStage = 1;
      }
    }
  }

  try {
    if (startFromStage <= 1) {
      const seedDomain = await getSeedDomain();
      currentData = await runOcean(seedDomain);
      saveStageOutput(1, currentData);
    }

    if (startFromStage <= 2) {
      currentData = await runProspeo(currentData);
      saveStageOutput(2, currentData);
      console.log(chalk.gray('\nCooling down before Stage 3s...\n'));
      await delay(3000);
    }

    if (startFromStage <= 3) {
      currentData = await runProspeoEmail(currentData);
      saveStageOutput(3, currentData);
    }

    if (startFromStage <= 4) {
      const validatedContacts = currentData;

      if (validatedContacts.length === 0) {
        throw new Error('No valid email addresses remained after verification filters.');
      }

      const approved = await safetyCheckpoint(validatedContacts);
      if (!approved) {
        logger.warn('Execution halted at Safety Checkpoint. No emails were sent.');
        process.exit(0);
      }

      const sentData = await runBrevo(validatedContacts);
      saveStageOutput(4, sentData);

      console.log(chalk.green.bold('\n━'.repeat(60)));
      logger.success(`Pipeline completed successfully! Sent ${sentData.length} outreach emails.`);
      console.log(chalk.green.bold('━'.repeat(60) + '\n'));
    }

  } catch (error) {
    logger.error(`Pipeline execution failed: ${error.message}`);
    if (error.stack) {
      console.error(chalk.red(error.stack));
    }
    console.log(chalk.gray('\n  Tip: Rerun without --fresh to resume from last checkpoint\n'));
    process.exit(1);
  }
}

main();