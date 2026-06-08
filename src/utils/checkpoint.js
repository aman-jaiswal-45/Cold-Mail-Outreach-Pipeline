const readline = require('readline');
const chalk = require('chalk');

async function safetyCheckpoint(contacts) {
  console.log(chalk.yellow('\n' + '━'.repeat(50)));
  console.log(chalk.yellow.bold('SAFETY CHECKPOINT'));
  console.log(chalk.yellow('Review contacts before emails are sent'));
  console.log(chalk.yellow('━'.repeat(50) + '\n'));

  const preview = contacts.slice(0, 10);
  preview.forEach((c, i) => {
    console.log(chalk.white(`${i + 1}. ${c.name}`));
    console.log(chalk.gray(`${c.title} @ ${c.company}`));
    console.log(chalk.gray(`${c.email}\n`));
  });

  if (contacts.length > 10) {
    console.log(chalk.gray(`... and ${contacts.length - 10} more contacts\n`));
  }

  console.log(chalk.cyan.bold(`Total emails queued: ${contacts.length}`));
  console.log(chalk.yellow('\n' + '━'.repeat(50) + '\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(
      chalk.bold('Type "yes" to send, anything else to cancel: '),
      (answer) => {
        rl.close();
        const confirmed = answer.toLowerCase().trim() === 'yes';
        if (!confirmed) {
          console.log(chalk.red('\nCancelled — no emails sent.\n'));
        }
        resolve(confirmed);
      }
    );
  });
}

module.exports = { safetyCheckpoint };