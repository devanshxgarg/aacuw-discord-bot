# Discord Anti-Spam Bot

This bot removes suspicious spam messages, including giveaway-scam style posts such as:

`I'm moving out and giving away my MacBook`

It currently blocks:

- giveaway or "moving out" scam wording
- duplicate repeated messages
- burst spam from sending too many messages in a short time

## Setup

1. Create a Discord bot in the Discord Developer Portal.
2. Enable the `Message Content Intent` for the bot.
3. Copy `.env.example` to `.env`.
4. Put your bot token in `DISCORD_BOT_TOKEN`.
5. Optionally add a text channel ID to `LOG_CHANNEL_ID` for moderation logs.
6. Install dependencies:

```bash
npm install
```

7. Start the bot:

```bash
npm start
```

## Required Bot Permissions

Invite the bot with these permissions:

- Read Messages / View Channels
- Send Messages
- Manage Messages
- Read Message History

## How It Works

The bot listens for new messages and removes them when:

- the message contains multiple suspicious scam phrases
- the same user posts the same content repeatedly
- the same user sends too many messages inside a short burst window

## Notes

- The giveaway-scam detector is intentionally simple and easy to tune.
- You can adjust thresholds and phrase patterns in `src/index.js`.

## Run It 24/7 On Render

If you want the bot to stay online even when your Mac is off, deploy it as a Render worker.

1. Push this project to a GitHub repo.
2. In Render, create a new Blueprint from that repo.
3. Render will detect the included `render.yaml` file.
4. When prompted for environment variables, set `DISCORD_BOT_TOKEN` to your real Discord bot token.
5. Leave `LOG_CHANNEL_ID` empty if you do not want logging.
6. Deploy the service.

This project is configured as a background worker, not a website, so Render should keep the bot process running continuously after deploy.
