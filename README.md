# AACUW Discord Bot

A Discord moderation bot built to automatically detect spam, reduce scam-style messages, and support community engagement workflows inside Discord servers.

The bot was developed for the University of Washington Applied Analytics Club (AACUW) Discord server and includes automated moderation tools alongside private DM-based submission tracking systems.

## Features

### Moderation & Spam Detection

* Detects and removes suspicious giveaway or “moving out” scam messages
* Prevents duplicate repeated-message spam
* Detects burst spam from rapid message sending
* Automatically removes flagged messages using Discord moderation permissions
* Optional moderation logging to a designated Discord channel

### Community Submission Tracking

The bot also supports private DM slash commands for tracking professional development activities:

* Resume submissions
* LinkedIn profile submissions
* Coffee chat confirmations

Submission totals are persisted locally using JSON storage.

## Slash Commands

### DM Commands

* `/submitresume` — Upload a resume file privately to the bot
* `/submitlinkedin` — Submit a LinkedIn profile URL
* `/submitcoffeechat` — Upload a screenshot of a scheduled coffee chat

### Public Commands

* `!pingbot`
* `!resumecount`
* `!linkedincount`
* `!coffeechatcount`

## Stack

* Node.js
* Discord.js
* JavaScript
* Render (deployment)

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/devanshxgarg/aacuw-discord-bot.git
cd aacuw-discord-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
LOG_CHANNEL_ID=optional_log_channel_id
```

### 4. Enable Discord Intents

In the Discord Developer Portal:

* Enable **Message Content Intent**
* Ensure the bot has proper moderation permissions

### 5. Start the Bot

```bash
npm start
```

## Required Bot Permissions

The bot requires the following permissions:

* View Channels
* Read Message History
* Send Messages
* Manage Messages

## Deployment

This project includes a `render.yaml` configuration file for deployment on Render as a background worker.

### Deploy on Render

1. Push the repository to GitHub
2. Create a new Blueprint deployment in Render
3. Connect the GitHub repository
4. Add the required environment variables:

   * `DISCORD_BOT_TOKEN`
   * `LOG_CHANNEL_ID` (optional)
5. Deploy the service

The bot will remain online continuously through Render hosting.


