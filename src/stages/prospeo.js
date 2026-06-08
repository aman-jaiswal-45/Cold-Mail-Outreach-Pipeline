require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const { withRetry, rateLimitedBatch } = require('../utils/rateLimiter');
const { deduplicateByKey, filterIncomplete } = require('../utils/deduplicator');
const logger = require('../utils/logger');

const PROSPEO_URL = 'https://api.prospeo.io/search-person';

const MAX_PER_COMPANY = parseInt(process.env.MAX_PROSPECTS_PER_COMPANY) || 5;

const TARGET_SENIORITIES = ['Founder/Owner', 'C-Suite', 'Vice President'];

const DECISION_MAKER_KEYWORDS = [
  'ceo', 'chief executive',
  'cto', 'chief technology',
  'coo', 'chief operating',
  'cfo', 'chief financial',
  'cmo', 'chief marketing',
  'cpo', 'chief product',
  'founder', 'co-founder', 'cofounder',
  'owner', 'partner',
  'vice president', 'vp ',
  'president',
  'head of', 'head,',
  'director'
];

function isDecisionMaker(jobTitle) {
  if (!jobTitle) return false;
  const lower = jobTitle.toLowerCase();
  return DECISION_MAKER_KEYWORDS.some(keyword => lower.includes(keyword));
}

function normalizeLinkedin(url) {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.split('?')[0];
  return cleanUrl
    .replace('https://www.', 'https://')
    .replace(/\/$/, '')
    .toLowerCase()
    .trim();
}

function getCurrentSeniority(jobHistory) {
  if (!Array.isArray(jobHistory) || !jobHistory.length) return '';
  const currentJob = jobHistory.find(j => j.current === true);
  if (currentJob?.seniority) return currentJob.seniority;
  const fallback = jobHistory[0]?.seniority ?? '';
  if (fallback) {
    console.log(chalk.gray(`No current job found — using first entry seniority: ${fallback}`));
  }
  return fallback;
}

async function fetchProspectsForDomain(company) {
  if (!company?.domain || !company?.name) {
    console.warn(chalk.yellow(`Skipping invalid company entry: ${JSON.stringify(company)}`));
    return [];
  }
  let response;
  try {
    response = await withRetry(() =>
      axios.post(
        PROSPEO_URL,
        {
          page: 1,
          filters: {
            company: {
              websites: {
                include: [company.domain]
              }
            },
            person_seniority: {
              include: TARGET_SENIORITIES
            }
          }
        },
        {
          headers: {
            'X-KEY': process.env.PROSPEO_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      ));
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const message = err.message;

    if (status === 502 || status === 503 || status === 504) {
      console.warn(chalk.yellow(`Prospeo server error ${status} for ${company.domain} — skipping`));
      return [];
    }

    if (status === 500) {
      console.warn(chalk.yellow(`Prospeo internal error for ${company.domain} — skipping`));
      console.warn(chalk.gray(`Body: ${JSON.stringify(body)}`));
      return [];
    }

    logger.error(`Prospeo HTTP ${status ?? 'unknown'} for ${company.domain}: ${message}`);
    if (body) console.error(chalk.red(`   Response: ${JSON.stringify(body)}`));
    throw err;
  }

  const data = response.data;

  if (data.error) {
    switch (data.error_code) {
      case 'INSUFFICIENT_CREDITS':
        throw new Error('INSUFFICIENT_CREDITS');

      case 'INVALID_API_KEY':
        throw new Error('INVALID_API_KEY');

      case 'NO_RESULTS':
        console.log(chalk.yellow(`No results for ${company.domain}`));
        return [];

      case 'INVALID_FILTERS':
        console.warn(chalk.yellow(`Invalid filters for ${company.domain} — skipping`));
        return [];

      default:
        console.warn(chalk.yellow(`${data.error_code} for ${company.domain} — skipping`));
        return [];
    }
  }

  const results = data.results ?? [];

  if (!results.length) {
    console.log(chalk.yellow(`No decision makers found for ${company.domain}`));
    return [];
  }

  const prospects = results
    .map(r => ({
      person_id: r.person?.person_id ?? '',
      name: r.person?.full_name ?? '',
      title: r.person?.current_job_title ?? '',
      linkedin: normalizeLinkedin(r.person?.linkedin_url),
      company: company.name,
      domain: company.domain,
      seniority: getCurrentSeniority(r.person?.job_history)
    }));

  const decisionMakers = prospects.filter(p => isDecisionMaker(p.title));

  const identifiable = decisionMakers.filter(p => p.linkedin || p.person_id);

  if (decisionMakers.length !== identifiable.length) {
    const dropped = decisionMakers.length - identifiable.length;
    console.log(chalk.yellow(`Dropped ${dropped} prospects with no identifier`));
  }

  return identifiable.slice(0, MAX_PER_COMPANY);
}

async function runProspeo(companies) {
  logger.stage(2, `Finding decision makers for ${companies.length} companies`);
  console.log(chalk.gray(`Seniority targets : ${TARGET_SENIORITIES.join(', ')}`));
  console.log(chalk.gray(`Max per company   : ${MAX_PER_COMPANY}\n`));

  const { results, failed } = await rateLimitedBatch(
    companies,
    async (company) => {
      console.log(chalk.gray(`Searching: ${company.name} (${company.domain})`));
      const prospects = await fetchProspectsForDomain(company);

      prospects.forEach(p => {
        console.log(chalk.green(`${p.name} — ${p.title} [${p.seniority}]`));
      });

      return prospects;
    },
    {
      batchSize: 1,
      delayBetweenBatches: 1500,
      onProgress: (done, total) =>
        console.log(chalk.gray(`\nProgress: ${done}/${total} companies done\n`))
    }
  );

  if (failed.length > 0) {
    const creditError = failed.find(f => f.error?.includes('INSUFFICIENT_CREDITS'));
    if (creditError) {
      logger.error('Prospeo: Insufficient credits — pipeline stopped');
      throw new Error('Insufficient Prospeo credits — top up account and retry');
    }

    const authError = failed.find(f => f.error?.includes('INVALID_API_KEY'));
    if (authError) {
      logger.error('Prospeo: Invalid API key — check PROSPEO_API_KEY in .env');
      throw new Error('Invalid Prospeo API key');
    }
    fs.writeFileSync(
      'data/failed_stage2.json',
      JSON.stringify(failed, null, 2)
    );
    console.log(chalk.yellow(`\n${failed.length} companies failed — saved to data/failed_stage2.json`));
  }

  const allProspects = results.flat();

  if (!allProspects.length) {
    throw new Error('Stage 2: No prospects found across all companies');
  }

  const deduped = deduplicateByKey(allProspects, 'linkedin');

  const complete = filterIncomplete(deduped, ['name', 'domain']);

  console.log('');
  logger.success(`Stage 2 complete — ${complete.length} decision makers found`);

  console.log(chalk.gray('\nDecision makers found:'));
  complete.forEach((p, i) => {
    console.log(chalk.gray(`${i + 1}. ${p.name} — ${p.title} @ ${p.company} [${p.seniority}]`));
  });

  return complete;
}

module.exports = { runProspeo };