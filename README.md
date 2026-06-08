# Cold Outreach Pipeline Engine (Job Sourcing Automation)

A fully automated, four-stage CLI pipeline that takes a single "seed domain" (a company you like), searches for lookalike companies, identifies engineering decision-makers, resolves their work emails, and sends highly personalized job application outreach emails.

Built as an engineering assignment to demonstrate end-to-end backend automation, rate-limiting resilience, API integrations, and robust state management.

---

## 🚀 The Pipeline Flow

```mermaid
graph TD
    [Seed Company Domain] -->|Stage 1: Ocean.io| --> [Lookalike Companies]
    [Lookalike Companies] -->|Stage 2: Prospeo Search| --> [Engineering Decision Makers]
    [Engineering Decision Makers] -->|Stage 3: Prospeo Enrich| --> [Verified Work Emails]
    [Verified Work Emails] -->|Validation & Safety Checkpoint| --> {User Confirmation}
    {User Confirmation} -->|Approved| --> [Stage 4: Brevo Email Outreach] --> [Send Mails]
    {User Confirmation} -->|Rejected| --> [Abort Execution]
```

### 1. **Stage 1: Lookalike Sourcing (Ocean.io)**
* Takes a seed domain (e.g., `stripe.com`) and queries the **Ocean.io API** to discover similar lookalike companies based on industry, size, and country filters.
* Handles pagination via `searchAfter` tokens and automatically filters out incomplete company entries.

### 2. **Stage 2: Decision Maker Discovery (Prospeo Search)**
* Takes the company list and queries the **Prospeo Search API** to identify key engineering decision-makers (C-Suite, Founders, VPs, Heads of Engineering).
* Filters candidates using job title keyword matching.

### 3. **Stage 3: Email Resolution (Prospeo Enrichment)**
* Takes discovered prospects and calls the **Prospeo Enrich Person API** with their LinkedIn URLs to retrieve verified, deliverable work emails.
* *Note: Replaced Eazyreach for email resolution using Prospeo's native enrichment API.*

### 4. **Safety Checkpoint & Validation**
* Cleans and validates email formats and runs them against a local bounce list (`data/bounced_emails.json`) to protect your sender reputation.
* Displays a console summary of targets and pauses for manual input (`yes`/`no`) before any emails are sent.

### 5. **Stage 4: Transactional Outreach (Brevo)**
* Sends personalized HTML job inquiry emails to confirmed decision-makers using **Brevo (formerly Sendinblue) SMTP API**.
* **Personalized Copy:** Dynamically references the prospect's name, role, and company. It highlights that *this exact email was sourced and delivered by an automation pipeline you built*, serving as a live demonstration of your software skills!

---

## ✨ Key Features & Resilience

* **Session Resumption & Caching:** Progress is automatically saved after each stage using a state manager. If the run fails or you stop it, you can resume from the last completed stage instead of starting fresh, saving API credits.
* **API Rate-Limiting & Retries:** Features a customized rate-limiter supporting batching and automatic exponential backoff retries when hitting `429` (rate limited) or `5xx` (server error) codes.
* **Failure isolation:** If a company or prospect lookup fails, the error is caught, logged to a failure file (e.g. `data/failed_stage2.json`), and the pipeline continues.
* **Pretty Console Loggers:** Elegant CLI logging with color-coding and loading spinners utilizing `chalk`.

---

## ⚙️ Project Structure

```
├── data/                  # Cached stage outputs, bounced lists, and failure logs
├── logs/                  # Consolidated execution log files (pipeline.log)
├── src/
│   ├── stages/
│   │   ├── ocean.js        # Stage 1: Sourcing lookalike companies
│   │   ├── prospeo.js      # Stage 2: Finding decision makers
│   │   ├── prospeoEmail.js # Stage 3: Resolving email IDs (replacing Eazyreach)
│   │   └── brevo.js        # Stage 4: Email outreach
│   ├── utils/
│   │   ├── checkpoint.js     # Safety checkpoint CLI prompt
│   │   ├── deduplicator.js   # De-duplication logic
│   │   ├── emailValidator.js # Regex validation and bounce filter
│   │   ├── logger.js         # Console and file logging configuration
│   │   ├── rateLimiter.js    # Batching and exponential backoff retries
│   │   └── stateManager.js   # Cache loading and saving
│   └── index.js           # Main orchestrator entry point
├── test-setup.js          # Interactive diagnostics & test runner
├── .env.example           # Environment variable template
└── package.json           # Dependencies and scripts
```

---

## 🛠️ Setup Instructions

### 1. Install Dependencies
Ensure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill out the keys in `.env`:
```ini
OCEAN_API_KEY=your_ocean_io_api_token
PROSPEO_API_KEY=your_prospeo_api_key
BREVO_API_KEY=your_brevo_smtp_api_key

SENDER_EMAIL=your_verified_brevo_sender_email@domain.com
SENDER_NAME=Your Name

MAX_COMPANIES=20
MAX_PROSPECTS_PER_COMPANY=3
```
*Note: Make sure `SENDER_EMAIL` is a verified sender address in your Brevo dashboard.*

---

## 🚀 How to Run

### Run the Main Pipeline
Start the interactive orchestrator:
```bash
npm start
```
Or specify the seed domain directly as a CLI argument:
```bash
node src/index.js stripe.com
```

### Run Diagnostics / Tests
Use the interactive test runner to check keys or test individual stage integrations without running the full pipeline:
```bash
node test-setup.js
```