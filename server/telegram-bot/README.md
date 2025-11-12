# WormGPT Telegram Bot

Lightweight Telegram bot that proxies user messages to the LongCat API using the WormGPT system prompt. Designed for easy deployment on serverless platforms (Vercel/Render Cloud Functions/Fly.io) or any Node.js host.

## Features

- `/start` and `/help` handlers.
- Stateless relay of user messages → LongCat → Telegram.
- Optional Telegram secret token verification.
- Health endpoint for uptime checks.
- Webhook registration helper script.

## Requirements

- Node.js 18+ (for optional native `fetch`, though `node-fetch` is bundled).
- Telegram bot token (from `@BotFather`).
- LongCat API key.

## Setup

1. Copy the example environment file:

   ```bash
   cp env.example .env
   ```

2. Fill in the values:

   ```env
   TELEGRAM_BOT_TOKEN=123456:abcdef
   LONGCAT_API_KEY=lc_live_xxx
   LONGCAT_MODEL=LongCat-Flash-Chat    # optional override
   LONGCAT_API_URL=https://api.longcat.chat/anthropic
   TELEGRAM_SECRET_TOKEN=optional-secret # optional
   ```

3. Install dependencies (already done if you ran `npm install` in the project root):

   ```bash
   npm install
   ```

4. Start the webhook listener locally:

   ```bash
   npm run dev
   ```

   The Express app listens on `http://localhost:8787`.

## Connecting the Telegram Webhook

Telegram requires a publicly reachable HTTPS endpoint. For local testing use a tunnel (e.g. Cloudflare Tunnel, ngrok).

Example with ngrok:

```bash
ngrok http 8787
```

Register the webhook URL (replace with your public URL):

```bash
npm run set:webhook -- https://<your-public-host>/webhook
```

If you set `TELEGRAM_SECRET_TOKEN`, the script automatically sends it along.

## Deployment

- **Vercel**: Create a new project from this directory. Ensure `TELEGRAM_BOT_TOKEN`, `LONGCAT_API_KEY`, etc. are added in project settings. Set the build command to `npm install` and the output to the default Node serverless handler.
- **Render / Railway**: deploy as a web service running `npm start`.
- **Cloud Functions**: wrap `app` (the exported Express instance) using the provider’s Express adapter.

Health check endpoint (GET): `/health`

Webhook endpoint (POST): `/webhook`

## Notes

- The bot is stateless: no conversation history is stored between messages, ensuring it is safe to run in ephemeral serverless environments.
- Errors from LongCat are logged to stderr and surfaced to the user as a generic failure message.

