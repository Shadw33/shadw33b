import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env')
  ].find((candidate) => candidate && fs.existsSync(candidate))
});

const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_API;
if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in environment');
}

const webhookUrl =
  process.env.TELEGRAM_WEBHOOK_URL ||
  process.argv.slice(2).find((arg) => arg.startsWith('http'));

if (!webhookUrl) {
  throw new Error('Provide TELEGRAM_WEBHOOK_URL env or pass the webhook URL as an argument.');
}

const secretToken = process.env.TELEGRAM_SECRET_TOKEN || undefined;

const params = new URLSearchParams({
  url: webhookUrl
});

if (secretToken) {
  params.append('secret_token', secretToken);
}

const url = `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`;

fetch(url)
  .then((res) => res.json())
  .then((data) => {
    if (data.ok) {
      console.log('Webhook registered:', data.description);
    } else {
      console.error('Failed to set webhook:', data);
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error('Error calling Telegram API:', err);
    process.exitCode = 1;
  });

