require('dotenv').config();
const axios  = require('axios');
const chalk  = require('chalk');

console.log(chalk.bold('\n🔍 Checking project setup...\n'));

const keys = [
  'OCEAN_API_KEY',
  'PROSPEO_API_KEY',
  'EAZYREACH_API_KEY',
  'BREVO_API_KEY',
  'SENDER_EMAIL',
  'SENDER_NAME'
];

let allGood = true;

keys.forEach(key => {
  if (process.env[key] && process.env[key] !== '') {
    console.log(chalk.green(`  ✅ ${key} is set`));
  } else {
    console.log(chalk.red(`  ❌ ${key} is MISSING`));
    allGood = false;
  }
});

console.log('');

if (allGood) {
  console.log(chalk.bold.green('✅ All environment variables set. Ready to code!\n'));
} else {
  console.log(chalk.bold.red('❌ Some variables missing. Check your .env file.\n'));
}

console.log(chalk.green('  ✅ axios installed correctly'));
console.log(chalk.green('  ✅ dotenv installed correctly'));
console.log(chalk.green('  ✅ chalk installed correctly'));
console.log(chalk.bold('\n🚀 Setup complete!\n'));