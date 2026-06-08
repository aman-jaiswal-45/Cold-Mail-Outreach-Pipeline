require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const { withRetry, rateLimitedBatch } = require('../utils/rateLimiter');
const { addBounced }                  = require('../utils/emailValidator');
const logger = require('../utils/logger');

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

function getEmailTemplate(prospect, senderName) {
  const firstName = prospect.name?.split(' ')[0] || 'there';
  const subject = `Interested in Software Development Opportunities at ${prospect.company}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      
      <p>Hi ${firstName},</p>

      <p>I hope you're doing well.</p>

      <p>
        I came across <strong>${prospect.company}</strong> and was impressed by the work your team is doing.
        I wanted to reach out to see whether there are any current or upcoming opportunities for a
        Junior Software Developer or Software Engineering Graduate.
      </p>

      <p>
        I recently completed my degree and have been building projects using JavaScript, Node.js,
        Express.js, React, MongoDB, REST APIs, and modern web technologies.
        I also enjoy working on backend systems, automation, and scalable applications.
      </p>

      <p>
        You can find some of my work here:
      </p>

      <p>
        GitHub:
        <a href="https://github.com/amanjaiswal-45">
          github.com/amanjaiswal-45
        </a>
      </p>

      <p>
        If there are any suitable opportunities, I would be grateful for the chance to
        learn more about the role and your team.
      </p>

      <p>
        Thank you for your time, and I appreciate any guidance you can provide.
      </p>

      <p>
        Best regards,<br>
        <strong>${senderName}</strong><br>
        NIT Bhopal
      </p>

    </div>
  `;
  return { subject, htmlContent };
}

async function sendOutreachEmail(prospect) {
  const senderEmail = process.env.SENDER_EMAIL;
  const senderName = process.env.SENDER_NAME;
  const { subject, htmlContent } = getEmailTemplate(prospect, senderName);

  try {
    const response = await withRetry(() =>
      axios.post(
        BREVO_EMAIL_URL,
        {
          sender: {
            name: senderName,
            email: senderEmail
          },
          to: [
            {
              name: prospect.name,
              email: prospect.email
            }
          ],
          subject: subject,
          htmlContent: htmlContent
        },
        {
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          }
        }
      )
    );

    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;

    if (status === 550 || status === 551 || status === 552) {
      console.warn(chalk.yellow(`Bounce detected for ${prospect.email} — added to bounce list`));
      addBounced(prospect.email);
      return null; 
    }

    if (status === 401) {
      throw new Error('BREVO_INVALID_KEY');
    }
    if (status === 402) {
      throw new Error('BREVO_ACCOUNT_ISSUE');
    }

    logger.error(`Brevo HTTP ${status ?? 'unknown'} for ${prospect.email}: ${err.message}`);
    if (body) console.error(chalk.red(`Response: ${JSON.stringify(body)}`));
    throw err;
  }
}

async function runBrevo(prospects) {
   if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY missing in .env');
  }
  if (!process.env.SENDER_EMAIL) {
    throw new Error('SENDER_EMAIL missing in .env');
  }
  if (!process.env.SENDER_NAME) {
    throw new Error('SENDER_NAME missing in .env');
  }
  logger.stage(4, `Sending personalized outreach emails to ${prospects.length} contacts via Brevo`);
  console.log(chalk.gray(`Sender  : ${process.env.SENDER_NAME} <${process.env.SENDER_EMAIL}>\n`));

  const { results, failed } = await rateLimitedBatch(
    prospects,
    async (prospect) => {
      console.log(chalk.gray(`Sending email to: ${prospect.name} <${prospect.email}>`));
      const sentInfo = await sendOutreachEmail(prospect);
      if (!sentInfo) return null;
      console.log(chalk.green(`Sent successfully! Message ID: ${sentInfo.messageId || 'N/A'}`));

      return {
        ...prospect,
        messageId: sentInfo.messageId ?? null,
        sentAt: new Date().toISOString(),
        status: 'sent'
      };
    },
    {
      batchSize: 1,
      delayBetweenBatches: 2000,
      onProgress: (done, total) =>
        console.log(chalk.gray(`\nProgress: ${done}/${total} emails sent\n`))
    }
  );

  if (failed.length > 0) {
    const keyError = failed.find(f => f.error?.includes('BREVO_INVALID_KEY'));
    if (keyError) {
      logger.error('Brevo: Invalid API key — check BREVO_API_KEY in .env');
      throw new Error('Invalid Brevo API key');
    }

    const accountError = failed.find(f =>f.error?.includes('BREVO_ACCOUNT_ISSUE'));
    if (accountError) {
      logger.error('Brevo: Account issue — check your Brevo account status');
      throw new Error('Brevo account issue — check billing or sending limits');
    }
    fs.writeFileSync(
      'data/failed_stage4.json',
      JSON.stringify(failed, null, 2)
    );
    console.log(chalk.yellow(`\n${failed.length} emails failed — saved to data/failed_stage4.json`));
  }

  const successfullySent = results.filter(Boolean);
  if (successfullySent.length > 0) {
    fs.writeFileSync(
      'data/stage_4_output.json',
      JSON.stringify({
        sentAt:    new Date().toISOString(),
        sent:      successfullySent,
        failed:    failed,
        summary: {
          total:  prospects.length,
          sent:   successfullySent.length,
          failed: failed.length
        }
      }, null, 2)
    );
  }

  console.log('');
  logger.success(`Stage 4 complete — ${successfullySent.length} outreach emails sent out successfully.`);
  console.log(chalk.red(`  Failed : ${failed.length}`));
  console.log(chalk.gray('\n  Sent log saved → data/stage_4_output.json'));

  return successfullySent;
}

module.exports = { runBrevo };
