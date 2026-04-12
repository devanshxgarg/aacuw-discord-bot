require("dotenv").config();

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const messageHistory = new Map();

const SETTINGS = {
  burstWindowMs: 10_000,
  burstMessageThreshold: 5,
  duplicateWindowMs: 30_000,
  duplicateThreshold: 3,
  cleanupIntervalMs: 60_000,
};

const giveawayScamPatterns = [
  /i('| a)?m moving out/i,
  /giving away/i,
  /\bfree\b/i,
  /\bmac\s?book\b/i,
  /\biphone\b/i,
  /\blaptop\b/i,
  /\bconsole\b/i,
  /\bairpods\b/i,
  /\bfirst come\b/i,
  /\bdm me\b/i,
  /\bshipping only\b/i,
  /\bneed it gone\b/i,
];

function normalizeContent(content) {
  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGiveawayScamMessage(content) {
  const normalized = normalizeContent(content);
  const matches = giveawayScamPatterns.filter((pattern) => pattern.test(normalized)).length;

  return matches >= 2;
}

function getUserHistory(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const history = messageHistory.get(key) ?? [];
  messageHistory.set(key, history);
  return history;
}

function trimHistory(history, now) {
  const cutoff = now - Math.max(SETTINGS.burstWindowMs, SETTINGS.duplicateWindowMs);
  while (history.length > 0 && history[0].createdAt < cutoff) {
    history.shift();
  }
}

function hasBurstSpam(history, now) {
  const recentCount = history.filter(
    (entry) => now - entry.createdAt <= SETTINGS.burstWindowMs
  ).length;

  return recentCount >= SETTINGS.burstMessageThreshold;
}

function hasDuplicateSpam(history, normalizedContent, now) {
  const similarMessages = history.filter(
    (entry) =>
      entry.normalizedContent === normalizedContent &&
      now - entry.createdAt <= SETTINGS.duplicateWindowMs
  ).length;

  return similarMessages >= SETTINGS.duplicateThreshold;
}

async function logModerationAction(message, reason) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;

  try {
    const logChannel = await client.channels.fetch(logChannelId);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

    await logChannel.send(
      [
        `Removed message from <@${message.author.id}>`,
        `Reason: ${reason}`,
        `Channel: <#${message.channel.id}>`,
        `Content: ${message.content || "[no text content]"}`,
      ].join("\n")
    );
  } catch (error) {
    console.error("Failed to log moderation action:", error);
  }
}

async function moderateMessage(message, reason) {
  try {
    await message.delete();
    await logModerationAction(message, reason);

    if (message.channel?.isTextBased()) {
      await message.channel.send({
        content: `${message.author}, your message was removed for suspected spam: ${reason}.`,
      });
    }
  } catch (error) {
    console.error(`Failed to moderate message for reason "${reason}":`, error);
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (
    !message.guild ||
    message.author.bot ||
    !message.content ||
    !message.guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    return;
  }

  const now = Date.now();
  const normalizedContent = normalizeContent(message.content);
  const history = getUserHistory(message.guild.id, message.author.id);

  history.push({
    createdAt: now,
    normalizedContent,
  });

  trimHistory(history, now);

  if (isGiveawayScamMessage(message.content)) {
    await moderateMessage(message, "suspicious giveaway or moving-out scam wording");
    return;
  }

  if (hasBurstSpam(history, now)) {
    await moderateMessage(message, "too many messages sent in a short time");
    return;
  }

  if (hasDuplicateSpam(history, normalizedContent, now)) {
    await moderateMessage(message, "repeated duplicate messages");
  }
});

setInterval(() => {
  const now = Date.now();

  for (const [key, history] of messageHistory.entries()) {
    trimHistory(history, now);
    if (history.length === 0) {
      messageHistory.delete(key);
    }
  }
}, SETTINGS.cleanupIntervalMs);

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN in environment.");
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);
