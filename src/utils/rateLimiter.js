const chalk = require("chalk");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();

    } catch (err) {
      lastError = err;
      const status = err.response?.status;

      if (status === 429) {
        const retryAfter = err.response?.headers['retry-after'];
        const waitMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s

        console.warn(chalk.blue(`Rate limited. Waiting ${waitMs}ms (attempt ${attempt}/${maxRetries})`));
        await delay(waitMs);

      } else if (status >= 500) {
        console.warn(chalk.yellow(`Server error ${status}. Retrying (${attempt}/${maxRetries})`));
        await delay(baseDelay * attempt);

      } else if (attempt < maxRetries) {
        await delay(baseDelay);

      } else {
        throw err;
      }
    }
  }

  throw lastError;
}

async function rateLimitedBatch(items, fn, options = {}) {
  const {
    batchSize = 3,
    delayBetweenBatches = 1500,
    onProgress = null
  } = options;

  const results = [];
  const failed = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(item => fn(item))
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.warn(chalk.red(`Failed for: ${JSON.stringify(batch[idx])}`));
        console.warn(chalk.red(`Reason: ${result.reason?.message}`));
        failed.push({
          item: batch[idx],
          error: result.reason?.message
        });
      }
    });

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }

    if (i + batchSize < items.length) {
      await delay(delayBetweenBatches);
    }
  }

  return { results, failed };
}

module.exports = { delay, withRetry, rateLimitedBatch };