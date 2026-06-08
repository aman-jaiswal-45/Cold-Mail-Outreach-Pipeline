require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const { withRetry, delay } = require('../utils/rateLimiter');
const { deduplicateByKey, filterIncomplete } = require('../utils/deduplicator');
const logger = require('../utils/logger');

const OCEAN_URL = 'https://api.ocean.io/v3/search/companies';
const PAGE_SIZE = 10;
const MAX_COMPANIES = parseInt(process.env.MAX_COMPANIES) || 20;
const PAGE_DELAY_MS = 1500;

async function fetchPage(seedDomain, searchAfter = null) {
  const body = {
    size: PAGE_SIZE,
    companiesFilters: {
      lookalikeDomains: [seedDomain]
    }
  };

  if (searchAfter) {
    body.searchAfter = searchAfter;
  }

  const response = await axios.post(
    OCEAN_URL,
    body,
    {
      headers: {
        'x-api-token': process.env.OCEAN_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    companies: response.data?.companies ?? [],
    searchAfter: response.data?.searchAfter ?? null,
    total: response.data?.total ?? 0
  };
}

function normalizeCompany(item) {
  if (!item.company) {
    console.warn(chalk.yellow(`Unexpected response shape: ${JSON.stringify(item).slice(0, 100)}`));
  }
  const c = item.company ?? item;
  return {
    name: c.name ?? 'Unknown',
    domain: c.domain ?? '',
    size: c.companySize ?? '',
    country: c.primaryCountry ?? '',
    industry: c.industryCategories?.[0] ?? ''
  };
}

async function runOcean(seedDomain) {
  const cleanDomain = seedDomain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase()
    .trim();

  if (!cleanDomain) {
    throw new Error('Invalid seed domain provided');
  }

  logger.stage(1, 'Finding lookalike companies via Ocean.io');
  console.log(chalk.gray(`Seed : ${cleanDomain}`));
  console.log(chalk.gray(`Cap  : ${MAX_COMPANIES} companies max\n`));

  const allCompanies = [];
  let searchAfter = null;
  let pageNum = 1;

  while (allCompanies.length < MAX_COMPANIES) {
    try {
      console.log(chalk.gray(`Page ${pageNum} — fetching ${PAGE_SIZE} companies...`));
      const { companies, searchAfter: nextToken, total } = await withRetry(() => fetchPage(cleanDomain, searchAfter));
      if (pageNum === 1) {
        console.log(chalk.gray(`Total available: ${total} lookalike companies\n`));
        if (total === 0) {
          console.log(chalk.yellow('No lookalike companies found for this domain'));
          break;
        }
      }
      if (!companies.length) {
        console.log(chalk.yellow('No more results'));
        break;
      }
      const normalized = companies.map(normalizeCompany);
      allCompanies.push(...normalized);

      normalized.forEach((c, i) => {
        const num = (pageNum - 1) * PAGE_SIZE + i + 1;
        console.log(chalk.gray(`${num}. ${c.name} — ${c.domain}`));
      });

      if (!nextToken) {
        console.log(chalk.gray('\nNo more pages'));
        break;
      }

      if (allCompanies.length >= MAX_COMPANIES) {
        console.log(chalk.gray(`\nReached cap of ${MAX_COMPANIES} companies`));
        break;
      }

      searchAfter = nextToken;
      pageNum++;
      console.log(chalk.gray(`Waiting ${PAGE_DELAY_MS}ms...\n`));
      await delay(PAGE_DELAY_MS);

    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        console.warn(chalk.yellow('Rate limited — waiting 5s...'));
        await delay(5000);
        continue;
      }
      if (status === 402) {
        logger.error('Ocean.io: Insufficient credits — using results so far');
        break;
      }
      if (status === 403) {
        logger.error('Ocean.io: Invalid API token — check .env');
        throw err;
      }

      logger.error(`Ocean.io page ${pageNum} failed: ${err.message}`);
      if (err.response?.data) {
        console.error(chalk.red(JSON.stringify(err.response.data, null, 2)));
      }
      break;
    }
  }

  if (!allCompanies.length) {
    throw new Error('Stage 1: No companies found — check seed domain');
  }

  const trimmed = allCompanies.slice(0, MAX_COMPANIES);
  const deduped = deduplicateByKey(trimmed, 'domain');
  const complete = filterIncomplete(deduped, ['domain', 'name']);

  console.log('');
  logger.success(`Stage 1 complete — ${complete.length} companies ready for Stage 2`);

  console.log(chalk.gray('Final company list:'));
  complete.forEach((c, i) => {
    console.log(chalk.gray(`${i + 1}. ${c.name} — ${c.domain} (${c.size}, ${c.country})`));
  });

  return complete;
}

module.exports = { runOcean };