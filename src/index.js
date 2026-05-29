require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  Partials,
  PermissionsBitField,
  SlashCommandBuilder,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const messageHistory = new Map();
const dataDirectory = path.join(__dirname, "..", "data");
const resumeCounterPath = path.join(dataDirectory, "resume-count.json");
const linkedinCounterPath = path.join(dataDirectory, "linkedin-count.json");
const coffeeChatCounterPath = path.join(dataDirectory, "coffee-chat-count.json");

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

const resumeFileExtensions = [".pdf", ".doc", ".docx", ".rtf", ".txt", ".pages"];
const resumeCommandName = "submitresume";
const linkedinCommandName = "submitlinkedin";
const coffeeChatCommandName = "submitcoffeechat";
const linkedinUrlPattern = /^https?:\/\/(www\.)?linkedin\.com\/.+/i;
const screenshotFileExtensions = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function loadResumeCounter() {
  return loadCounterFile(resumeCounterPath, "resume");
}

function loadCounterFile(filePath, label) {
  ensureDataDirectory();

  if (!fs.existsSync(filePath)) {
    return { total: 0, countedMessageIds: [], countedUserIds: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      total: Number.isInteger(parsed.total) ? parsed.total : 0,
      countedMessageIds: Array.isArray(parsed.countedMessageIds)
        ? parsed.countedMessageIds.slice(-500)
        : [],
      countedUserIds: Array.isArray(parsed.countedUserIds)
        ? parsed.countedUserIds.slice(-500)
        : [],
    };
  } catch (error) {
    console.error(`Failed to read ${label} counter file:`, error);
    return { total: 0, countedMessageIds: [], countedUserIds: [] };
  }
}

const resumeCounter = loadResumeCounter();
const linkedinCounter = loadCounterFile(linkedinCounterPath, "linkedin");
const coffeeChatCounter = loadCounterFile(coffeeChatCounterPath, "coffee chat");

function saveResumeCounter() {
  saveCounterFile(resumeCounterPath, resumeCounter);
}

function saveCounterFile(filePath, counter) {
  ensureDataDirectory();
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        total: counter.total,
        countedMessageIds: counter.countedMessageIds.slice(-500),
        countedUserIds: Array.isArray(counter.countedUserIds)
          ? counter.countedUserIds.slice(-500)
          : [],
      },
      null,
      2
    )
  );
}

function saveLinkedinCounter() {
  saveCounterFile(linkedinCounterPath, linkedinCounter);
}

function saveCoffeeChatCounter() {
  saveCounterFile(coffeeChatCounterPath, coffeeChatCounter);
}

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

function isResumeLikeAttachment(attachment) {
  const normalizedName = (attachment.name || "").toLowerCase();
  const extension = path.extname(normalizedName);

  return (
    resumeFileExtensions.includes(extension) ||
    normalizedName.includes("resume") ||
    normalizedName.includes("cv")
  );
}

function isScreenshotLikeAttachment(attachment) {
  const normalizedName = (attachment.name || "").toLowerCase();
  const extension = path.extname(normalizedName);
  const contentType = (attachment.contentType || "").toLowerCase();

  return (
    screenshotFileExtensions.includes(extension) ||
    contentType.startsWith("image/")
  );
}

async function trackResumeSubmission(submissionId, userId, userTag, replyFn) {
  if (resumeCounter.countedUserIds.includes(userId)) {
    await replyFn(`${resumeCounter.total} Resumes Completed!`);
    return;
  }

  resumeCounter.total += 1;
  resumeCounter.countedMessageIds.push(submissionId);
  resumeCounter.countedUserIds.push(userId);
  resumeCounter.countedMessageIds = resumeCounter.countedMessageIds.slice(-500);
  resumeCounter.countedUserIds = resumeCounter.countedUserIds.slice(-500);
  saveResumeCounter();

  console.log(`Resume count: ${resumeCounter.total} (from ${userTag})`);
  await replyFn(`${resumeCounter.total} Resumes Completed!`);
}

async function trackLinkedinSubmission(submissionId, userId, userTag, replyFn) {
  if (linkedinCounter.countedUserIds.includes(userId)) {
    await replyFn(`${linkedinCounter.total} LinkedIns Completed!`);
    return;
  }

  linkedinCounter.total += 1;
  linkedinCounter.countedMessageIds.push(submissionId);
  linkedinCounter.countedUserIds.push(userId);
  linkedinCounter.countedMessageIds = linkedinCounter.countedMessageIds.slice(-500);
  linkedinCounter.countedUserIds = linkedinCounter.countedUserIds.slice(-500);
  saveLinkedinCounter();

  console.log(`LinkedIn count: ${linkedinCounter.total} (from ${userTag})`);
  await replyFn(`${linkedinCounter.total} LinkedIns Completed!`);
}

async function trackCoffeeChatSubmission(submissionId, userTag, replyFn) {
  if (coffeeChatCounter.countedMessageIds.includes(submissionId)) {
    await replyFn(`${coffeeChatCounter.total} Coffee Chats Scheduled!`);
    return;
  }

  coffeeChatCounter.total += 1;
  coffeeChatCounter.countedMessageIds.push(submissionId);
  coffeeChatCounter.countedMessageIds = coffeeChatCounter.countedMessageIds.slice(-500);
  saveCoffeeChatCounter();

  console.log(`Coffee chat count: ${coffeeChatCounter.total} (from ${userTag})`);
  await replyFn(`${coffeeChatCounter.total} Coffee Chats Scheduled!`);
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
  } catch (error) {
    console.error(`Failed to moderate message for reason "${reason}":`, error);
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Resume DMs counted so far: ${resumeCounter.total}`);
  console.log(`LinkedIn DMs counted so far: ${linkedinCounter.total}`);
  console.log(`Coffee chats counted so far: ${coffeeChatCounter.total}`);
});

client.on("ready", async () => {
  try {
    const existingCommands = await client.application.commands.fetch();
    const resumeCommand = existingCommands.find(
      (command) => command.name === resumeCommandName
    );

    const commandDefinition = new SlashCommandBuilder()
      .setName(resumeCommandName)
      .setDescription("Privately submit a resume to the bot in DMs")
      .addAttachmentOption((option) =>
        option
          .setName("file")
          .setDescription("Your resume file, like PDF or DOCX")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("note")
          .setDescription("Optional note to send with the resume")
          .setRequired(false)
      )
      .toJSON();

    commandDefinition.contexts = [InteractionContextType.BotDM];

    const linkedinCommand = existingCommands.find(
      (command) => command.name === linkedinCommandName
    );
    const coffeeChatCommand = existingCommands.find(
      (command) => command.name === coffeeChatCommandName
    );

    const linkedinCommandDefinition = new SlashCommandBuilder()
      .setName(linkedinCommandName)
      .setDescription("Privately submit a LinkedIn profile to the bot in DMs")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("Your LinkedIn profile URL")
          .setRequired(true)
      )
      .toJSON();

    linkedinCommandDefinition.contexts = [InteractionContextType.BotDM];

    const coffeeChatCommandDefinition = new SlashCommandBuilder()
      .setName(coffeeChatCommandName)
      .setDescription("Privately submit a coffee chat email screenshot in DMs")
      .addAttachmentOption((option) =>
        option
          .setName("screenshot")
          .setDescription("A screenshot of the scheduled coffee chat email")
          .setRequired(true)
      )
      .toJSON();

    coffeeChatCommandDefinition.contexts = [InteractionContextType.BotDM];

    if (resumeCommand) {
      await client.application.commands.edit(resumeCommand.id, commandDefinition);
      console.log(`Updated /${resumeCommandName} slash command for bot DMs.`);
    } else {
      await client.application.commands.create(commandDefinition);
      console.log(`Registered /${resumeCommandName} slash command for bot DMs.`);
    }

    if (linkedinCommand) {
      await client.application.commands.edit(
        linkedinCommand.id,
        linkedinCommandDefinition
      );
      console.log(`Updated /${linkedinCommandName} slash command for bot DMs.`);
    } else {
      await client.application.commands.create(linkedinCommandDefinition);
      console.log(`Registered /${linkedinCommandName} slash command for bot DMs.`);
    }

    if (coffeeChatCommand) {
      await client.application.commands.edit(
        coffeeChatCommand.id,
        coffeeChatCommandDefinition
      );
      console.log(`Updated /${coffeeChatCommandName} slash command for bot DMs.`);
    } else {
      await client.application.commands.create(coffeeChatCommandDefinition);
      console.log(`Registered /${coffeeChatCommandName} slash command for bot DMs.`);
    }
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (
    interaction.commandName !== resumeCommandName &&
    interaction.commandName !== linkedinCommandName &&
    interaction.commandName !== coffeeChatCommandName
  ) {
    return;
  }

  if (interaction.channel.type !== ChannelType.DM) {
    await interaction.reply({
      content: "Please open a DM with me and run /submitresume there so your resume stays private.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === resumeCommandName) {
    const file = interaction.options.getAttachment("file", true);
    const note = interaction.options.getString("note");

    if (!isResumeLikeAttachment(file)) {
      await interaction.reply({
        content: "That file does not look like a resume yet. Please upload a PDF, DOC, DOCX, RTF, TXT, or Pages file.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await trackResumeSubmission(
      interaction.id,
      interaction.user.id,
      interaction.user.tag,
      async (content) => {
      await interaction.reply({
        content: note ? `${content}\nNote received.` : content,
        flags: MessageFlags.Ephemeral,
      });
      }
    );
    return;
  }

  if (interaction.commandName === linkedinCommandName) {
    const url = interaction.options.getString("url", true).trim();

    if (!linkedinUrlPattern.test(url)) {
      await interaction.reply({
        content: "Please send a valid LinkedIn profile URL.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await trackLinkedinSubmission(
      interaction.id,
      interaction.user.id,
      interaction.user.tag,
      async (content) => {
        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
        });
      }
    );
    return;
  }

  if (interaction.commandName === coffeeChatCommandName) {
    const screenshot = interaction.options.getAttachment("screenshot", true);

    if (!isScreenshotLikeAttachment(screenshot)) {
      await interaction.reply({
        content: "Please upload an image screenshot file for the coffee chat email.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await trackCoffeeChatSubmission(
      interaction.id,
      interaction.user.tag,
      async (content) => {
        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
        });
      }
    );
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  console.log(
    `Message event: channelType=${message.channel.type} guild=${message.guild?.id || "dm"} author=${message.author.tag} content="${message.content || "[no text]"}" attachments=${message.attachments.size}`
  );

  if (message.channel.type === ChannelType.DM) {
    console.log(`DM received from ${message.author.tag}.`);
    return;
  }

  if (message.content === "!pingbot") {
    await message.reply("Bot is running.");
    return;
  }

  if (message.content === "!resumecount") {
    await message.reply(`${resumeCounter.total} Resumes Completed!`);
    return;
  }

  if (message.content === "!linkedincount") {
    await message.reply(`${linkedinCounter.total} LinkedIns Completed!`);
    return;
  }

  if (message.content === "!coffeechatcount") {
    await message.reply(`${coffeeChatCounter.total} Coffee Chats Scheduled!`);
    return;
  }

  if (
    !message.guild ||
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
