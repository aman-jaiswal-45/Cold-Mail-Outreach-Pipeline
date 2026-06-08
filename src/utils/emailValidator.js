const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const BOUNCE_FILE = path.join(__dirname, '../../data/bounced_emails.json');

function isValidFormat(email) {
  if (!email || typeof email !== 'string') return false;

  const regex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(email.trim())) return false;

  const blocked = [
    'noreply@', 'no-reply@', 'donotreply@',
    'test@', 'admin@', 'info@', 'support@',
    'hello@', 'contact@', 'team@', 'hr@'
  ];

  const lower = email.toLowerCase();
  if (blocked.some(b => lower.startsWith(b))) return false;

  return true;
}

function loadBounceList() {
  try {
    if (fs.existsSync(BOUNCE_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(BOUNCE_FILE, 'utf-8')));
    }
  } catch {
  }
  return new Set();
}

function addBounced(email) {
  const list = loadBounceList();
  list.add(email.toLowerCase().trim());
  fs.writeFileSync(BOUNCE_FILE, JSON.stringify([...list], null, 2));
}

function filterEmails(contacts) {
  const bounceList = loadBounceList();
  const valid = [];
  const dropped = [];

  for (const contact of contacts) {
    const email = contact.email?.toLowerCase().trim();

    if (!isValidFormat(email)) {
      dropped.push({ ...contact, reason: 'Invalid email format' });

    } else if (bounceList.has(email)) {
      dropped.push({ ...contact, reason: 'Previously bounced' });

    } else {
      valid.push({ ...contact, email });
    }
  }

  console.log(chalk.green(`Email filter: ${valid.length} valid, ${dropped.length} dropped`));

  if (dropped.length > 0) {
    fs.writeFileSync(
      path.join(__dirname, '../../data/dropped_emails.json'),
      JSON.stringify(dropped, null, 2)
    );
  }

  return valid;
}

module.exports = { isValidFormat, filterEmails, addBounced };