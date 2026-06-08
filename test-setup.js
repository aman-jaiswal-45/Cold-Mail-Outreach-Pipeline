require('dotenv').config();
const readline = require('readline');
const chalk = require('chalk');
const axios = require('axios');

const { runOcean } = require('./src/stages/ocean');
const { runProspeo } = require('./src/stages/prospeo');
const { runProspeoEmail } = require('./src/stages/prospeoEmail');
const { runBrevo } = require('./src/stages/brevo');

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

function checkSetup() {
  console.log(chalk.blue.bold('\n--- Environment Check ---'));
  const keys = ['OCEAN_API_KEY', 'PROSPEO_API_KEY', 'BREVO_API_KEY', 'SENDER_EMAIL', 'SENDER_NAME'];
  let allGood = true;

  keys.forEach(key => {
    if (process.env[key] && process.env[key].trim() !== '') {
      console.log(chalk.green(`${key} is set`));
    } else {
      console.log(chalk.red(`${key} is MISSING`));
      allGood = false;
    }
  });

  if (allGood) {
    console.log(chalk.bold.green('\nConfiguration is ready to go!\n'));
  } else {
    console.log(chalk.bold.yellow('\nSome environment variables are missing. Please complete your .env file.\n'));
  }
  return allGood;
}

async function testStage1() {
  console.log(chalk.blue.bold('\n--- Testing Stage 1: Ocean.io ---'));
  const domain = await askQuestion(chalk.cyan('Enter seed domain to look up: ')) || 'stripe.com';
  try {
    const companies = await runOcean(domain);
    console.log(chalk.green(`\nStage 1 Test Success! Found ${companies.length} companies.`));
    return companies;
  } catch (err) {
    console.error(chalk.red(`Stage 1 Test Failed: ${err.message}`));
  }
}

async function testStage2() {
  console.log(chalk.blue.bold('\n--- Testing Stage 2: Prospeo Search ---'));
  const mockCompanies = [
    { name: 'Razorpay', domain: 'razorpay.com' },
    { name: 'Cashfree', domain: 'cashfree.com' }
  ];
  console.log(chalk.gray('Using mock companies: Razorpay, Cashfree'));
  try {
    const prospects = await runProspeo(mockCompanies);
    console.log(chalk.green(`\nStage 2 Test Success! Found ${prospects.length} prospects.`));
    return prospects;
  } catch (err) {
    console.error(chalk.red(`Stage 2 Test Failed: ${err.message}`));
  }
}

async function testStage3() {
  console.log(chalk.blue.bold('\n--- Testing Stage 3: Prospeo Email Enrichment ---'));
  const mockProspects = [
    {
      person_id: '',
      name: 'Harshil Mathur',
      title: 'Co-founder & CEO',
      linkedin: 'https://www.linkedin.com/in/harshilmathur',
      company: 'Razorpay',
      domain: 'razorpay.com'
    }
  ];
  console.log(chalk.gray(`Attempting enrichment for mock prospect: ${mockProspects[0].name}`));
  try {
    const enriched = await runProspeoEmail(mockProspects);
    console.log(chalk.green(`\nStage 3 Test Success! Resolved email for ${enriched.length} prospects.`));
    return enriched;
  } catch (err) {
    console.error(chalk.red(`Stage 3 Test Failed: ${err.message}`));
  }
}

async function testStage4() {
  console.log(chalk.blue.bold('\n--- Testing Stage 4: Brevo Email ---'));
  const testEmail = await askQuestion(chalk.cyan('Enter a test recipient email: '));
  if (!testEmail) {
    console.log(chalk.red('Email is required to test Stage 4.\n'));
    return;
  }

  const mockContacts = [
    {
      name: 'Test Candidate',
      email: testEmail,
      title: 'Hiring Manager',
      company: 'Demo Corp',
      domain: 'democorp.com'
    }
  ];

  try {
    const sent = await runBrevo(mockContacts);
    console.log(chalk.green(`\nStage 4 Test Success! Sent ${sent.length} emails.`));
  } catch (err) {
    console.error(chalk.red(`Stage 4 Test Failed: ${err.message}`));
  }
}

async function testEndToEnd() {
  console.log(chalk.blue.bold('\n--- Running End-to-End Simulation ---'));
  const domain = await askQuestion(chalk.cyan('Enter seed domain (default: stripe.com): ')) || 'stripe.com';

  try {
    console.log(chalk.magenta('\n>> Running Stage 1...'));
    const companies = await runOcean(domain);

    console.log(chalk.magenta('\n>> Running Stage 2...'));
    const prospects = await runProspeo(companies);

    console.log(chalk.magenta('\n>> Running Stage 3...'));
    const enriched = await runProspeoEmail(prospects);

    console.log(chalk.magenta('\n>> Running Stage 4...'));
    const sent = await runBrevo(enriched);

    console.log(chalk.bold.green('\nEnd-to-End Test completed successfully!'));
  } catch (err) {
    console.error(chalk.red(`\nEnd-to-End Simulation failed at: ${err.message}`));
  }
}

async function main() {
  let exit = false;
  while (!exit) {
    console.log(chalk.blue.bold('\n============================================='));
    console.log(chalk.blue.bold('        PIPELINE TEST AND DIAGNOSTIC TOOL'));
    console.log(chalk.blue.bold('============================================='));
    console.log('1. Check setup and .env variables');
    console.log('2. Test Stage 1: Ocean.io (Company Search)');
    console.log('3. Test Stage 2: Prospeo (Prospect Search)');
    console.log('4. Test Stage 3: Prospeo (Email Enrichment)');
    console.log('5. Test Stage 4: Brevo (Outreach Email)');
    console.log('6. Run Full End-to-End Pipeline test');
    console.log('7. Exit');
    console.log('---------------------------------------------');

    const choice = await askQuestion(chalk.cyan('Enter your choice (1-7): '));
    switch (choice) {
      case '1':
        checkSetup();
        break;
      case '2':
        await testStage1();
        break;
      case '3':
        await testStage2();
        break;
      case '4':
        await testStage3();
        break;
      case '5':
        await testStage4();
        break;
      case '6':
        await testEndToEnd();
        break;
      case '7':
        exit = true;
        console.log(chalk.yellow('\nGoodbye!\n'));
        break;
      default:
        console.log(chalk.red('Invalid choice. Please select 1-7.\n'));
    }
  }
}

main();