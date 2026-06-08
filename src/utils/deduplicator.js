const chalk = require("chalk");

function deduplicateByKey(items, key) {
  const seen = new Set();
  const unique = [];
  let dupes = 0;

  for (const item of items) {
    const val = item[key]?.toString().toLowerCase().trim();

    if (!val) {
      dupes++;
      continue;
    }

    if (seen.has(val)) {
      dupes++;
    } else {
      seen.add(val);
      unique.push(item);
    }
  }

  console.log(chalk.blue.bold(`Dedup [${key}]: ${items.length} total → ${unique.length} unique, ${dupes} removed`));
  return unique;
}

function filterIncomplete(items, requiredFields) {
  const valid = [];
  const invalid = [];

  for (const item of items) {
    const missingFields = requiredFields.filter(f =>
      !item[f] || item[f].toString().trim() === ''
    );

    if (missingFields.length === 0) {
      valid.push(item);
    } else {
      invalid.push({ item, missingFields });
    }
  }

  if (invalid.length > 0) {
    console.log(chalk.yellow(`Dropped ${invalid.length} incomplete records`));
  }

  return valid;
}

module.exports = { deduplicateByKey, filterIncomplete };