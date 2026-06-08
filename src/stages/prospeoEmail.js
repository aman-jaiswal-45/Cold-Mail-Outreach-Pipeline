require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const { withRetry, rateLimitedBatch } = require('../utils/rateLimiter');
const { deduplicateByKey, filterIncomplete } = require('../utils/deduplicator');
const { filterEmails } = require('../utils/emailValidator');
const logger = require('../utils/logger');

const PROSPEO_ENRICH_URL = 'https://api.prospeo.io/enrich-person';

async function fetchEmailForProspect(prospect) {
  let response;
  try {
    response = await withRetry(() =>
      axios.post(
        PROSPEO_ENRICH_URL,
        {
          only_verified_email: true,
          enrich_mobile: false,
          data: {
            ...(prospect.person_id && { person_id: prospect.person_id }),
            ...(prospect.linkedin && { linkedin_url: prospect.linkedin }),
            full_name: prospect.name,
            company_website: prospect.domain
          }
        },
        {
          headers: {
            'X-KEY': process.env.PROSPEO_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      )
    );
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;

    if (status === 500 || status === 502 ||
      status === 503 || status === 504) {
      console.warn(chalk.yellow(`Server error ${status} for ${prospect.name} — skipping`));
      if (body) console.warn(chalk.gray(`Body: ${JSON.stringify(body)}`));
      return null;
    }

    logger.error(`Prospeo Enrich HTTP ${status ?? 'unknown'} for ${prospect.name}: ${err.message}`);
    if (body) console.error(chalk.red(`Response: ${JSON.stringify(body)}`));
    throw err;
  }

  const data = response.data;

  if (data.error) {
    switch (data.error_code) {
      case 'NO_MATCH':
        console.log(chalk.yellow(`No match for ${prospect.name}`));
        return null;

      case 'INSUFFICIENT_CREDITS':
        throw new Error('INSUFFICIENT_CREDITS');

      case 'INVALID_API_KEY':
        throw new Error('INVALID_API_KEY');

      case 'INVALID_DATAPOINTS':
        console.log(chalk.yellow(`Invalid datapoints for ${prospect.name} — skipping`));
        return null;

      default:
        console.warn(chalk.yellow(`${data.error_code} for ${prospect.name} — skipping`));
        return null;
    }
  }

  const emailObj = data.person?.email;
  const emailStr = emailObj?.email;

  if (!emailObj?.revealed) {
    console.log(chalk.yellow(`Email not revealed for ${prospect.name}`));
    return null;
  }

  if (emailObj?.status !== 'VERIFIED') {
    console.log(chalk.yellow(`Email not verified for ${prospect.name} (status: ${emailObj?.status})`));
    return null;
  }

  if (!emailStr || emailStr.includes('*')) {
    console.log(chalk.yellow(`Masked email for ${prospect.name}: ${emailStr}`));
    return null;
  }

  if (data.free_enrichment) {
    console.log(chalk.gray(`Free (cached): ${prospect.name} → ${emailStr}`));
  } else {
    console.log(chalk.green(`${prospect.name} → ${emailStr}`));
  }

  return {
    name: prospect.name,
    title: prospect.title,
    company: prospect.company,
    domain: prospect.domain,
    linkedin: prospect.linkedin,
    email: emailStr.toLowerCase().trim(),
    email_status: emailObj?.status ?? 'VERIFIED',
    free: data.free_enrichment ?? false
  };
}

async function runProspeoEmail(prospects) {
  logger.stage(3, `Resolving work email IDs for ${prospects.length} prospects via Prospeo`);

  const { results, failed } = await rateLimitedBatch(
    prospects,
    async (prospect) => {
      console.log(chalk.gray(`Resolving: ${prospect.name} (${prospect.company})`));
      const enriched = await fetchEmailForProspect(prospect);

      if (enriched) {
        console.log(chalk.green(`Found: ${enriched.name} -> ${enriched.email} (${enriched.email_status})`));
      }
      return enriched;
    },
    {
      batchSize: 2,
      delayBetweenBatches: 1500,
      onProgress: (done, total) =>
        console.log(chalk.gray(`\nProgress: ${done}/${total} prospects processed\n`))
    }
  );

  if (failed.length > 0) {
    const creditError = failed.find(f => f.error?.includes('INSUFFICIENT_CREDITS'));
    if (creditError) {
      logger.error('Prospeo Enrich: Insufficient credits — pipeline stopped');
      throw new Error('Insufficient credits — top up Prospeo account');
    }

    const authError = failed.find(f => f.error?.includes('INVALID_API_KEY'));
    if (authError) {
      logger.error('Prospeo Enrich: Invalid API key — check .env');
      throw new Error('Invalid Prospeo API key');
    }

    fs.writeFileSync(
      'data/failed_stage3.json',
      JSON.stringify(failed, null, 2)
    );
    console.log(chalk.yellow(`\n${failed.length} prospects failed — saved to data/failed_stage3.json`));
  }

  const validProspects = results.filter(Boolean);

  if (!validProspects.length) {
    throw new Error('Stage 3: No verified emails found across all prospects');
  }

  const deduped = deduplicateByKey(validProspects, 'email');
  const complete = filterIncomplete(deduped, ['name', 'email', 'company', 'domain']);
  const validated = filterEmails(complete);

  console.log('');
  logger.success(`Stage 3 complete — ${validated.length} prospects with verified emails ready`);

  console.log(chalk.gray('\nVerified Contacts:'));
  validated.forEach((p, i) => {
    console.log(chalk.gray(`${i + 1}. ${p.name} — ${p.email} (${p.title} @ ${p.company})`));
  });

  return validated;
}

module.exports = { runProspeoEmail };