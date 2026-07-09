const crypto = require("crypto");
const prisma = require("./prisma");
const alertRepository = require("../repositories/alertRepository");
const { requireUserId } = require("../repositories/ownership");
const {
  encryptSecret,
  maybeDecrypt,
  maybeEncrypt,
} = require("./encryptionService");

const TELEGRAM_CHANNEL = "TELEGRAM";
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];

function generateVerificationCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function sanitizeChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    type: channel.channel,
    enabled: channel.enabled,
    verified: channel.verified,
    verificationCode: channel.verificationCode,
    lastDeliveryAt: channel.lastDeliveryAt,
    failureCount: channel.failureCount,
    digestMode: channel.config?.digestMode || "immediate",
    hasTelegramBotToken: Boolean(channel.telegramBotToken),
    hasTelegramChatId: Boolean(channel.telegramChatId),
  };
}

function notificationSecretContext(channel, field, userId = null) {
  return {
    scope: "notification_channel",
    channel: TELEGRAM_CHANNEL,
    channelId: channel?.id || null,
    userId: userId || channel?.userId || null,
    field,
  };
}

async function migrateLegacyTelegramSecrets(channel) {
  if (!channel) return channel;

  const legacyToken = channel.config?.telegramToken;
  const legacyChatId = channel.config?.telegramChatId;
  if (!legacyToken && !legacyChatId) {
    return channel;
  }

  const nextConfig = { ...(channel.config || {}) };
  delete nextConfig.telegramToken;
  delete nextConfig.telegramChatId;

  return prisma.run((db) =>
    db.notificationChannel.update({
      where: { id: channel.id },
      data: {
        telegramBotToken:
          channel.telegramBotToken ||
          maybeEncrypt(legacyToken, notificationSecretContext(channel, "telegramBotToken")),
        telegramChatId:
          channel.telegramChatId ||
          maybeEncrypt(legacyChatId, notificationSecretContext(channel, "telegramChatId")),
        config: nextConfig,
      },
    })
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramMessage(alert) {
  const category = alert.category || "SYSTEM";
  const symbol = alert.symbol || "SYSTEM";
  if (category === "RISK") {
    return [
      "🔴 <b>RISK WARNING</b>",
      "",
      escapeHtml(alert.title || "Risk rule triggered"),
      "",
      escapeHtml(alert.message || "Review the Risk tab before trading."),
    ].join("\n");
  }
  if (category === "APPROVAL") {
    return [
      "🟡 <b>APPROVAL REQUIRED</b>",
      "",
      `<b>${escapeHtml(symbol)}</b>`,
      "",
      escapeHtml(alert.message || "Review this trade in the dashboard."),
      "",
      "<b>Action:</b> Approve in Dashboard",
    ].join("\n");
  }
  if (category === "SCANNER") {
    const metadata = alert.metadata || {};
    return [
      "🟢 <b>BUY SIGNAL</b>",
      "",
      `<b>${escapeHtml(symbol)}</b>`,
      "",
      `<b>Score:</b> ${escapeHtml(alert.score ?? "N/A")}`,
      `<b>Confidence:</b> ${escapeHtml(alert.confidence ?? "N/A")}`,
      `<b>Backtest:</b> ${escapeHtml(alert.backtestReturn ?? metadata.backtest_return ?? "N/A")}`,
      `<b>Drawdown:</b> ${escapeHtml(alert.drawdown ?? metadata.drawdown ?? "N/A")}`,
      `<b>Strategy:</b> ${escapeHtml(metadata.strategyName || metadata.strategy || "Active strategy")}`,
      "",
      "<b>Action:</b> Open Dashboard",
    ].join("\n");
  }
  return [
    `⚪ <b>${escapeHtml(category)} ALERT</b>`,
    "",
    escapeHtml(alert.title || symbol),
    "",
    escapeHtml(alert.message || "Open the dashboard for details."),
  ].join("\n");
}

async function getTelegramChannel(userId) {
  const ownerId = requireUserId(userId);
  const channel = await prisma.run((db) =>
    db.notificationChannel.findUnique({
      where: {
        userId_channel: {
          userId: ownerId,
          channel: TELEGRAM_CHANNEL,
        },
      },
    })
  );
  return migrateLegacyTelegramSecrets(channel);
}

async function getNotificationChannels(userId) {
  const ownerId = requireUserId(userId);
  const channels = await prisma.run((db) =>
    db.notificationChannel.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: "desc" },
    })
  );
  return (await Promise.all(channels.map(migrateLegacyTelegramSecrets))).map(
    sanitizeChannel
  );
}

async function saveTelegramConfig(userId, input = {}) {
  const ownerId = requireUserId(userId);
  const token = String(input.telegramBotToken || input.botToken || "").trim();
  if (!token) {
    throw new Error("Telegram bot token is required.");
  }
  const verificationCode = generateVerificationCode();
  const digestMode = String(input.digestMode || "immediate").toLowerCase();

  const channel = await prisma.run((db) =>
    db.notificationChannel.upsert({
      where: {
        userId_channel: {
          userId: ownerId,
          channel: TELEGRAM_CHANNEL,
        },
      },
      create: {
        userId: ownerId,
        channel: TELEGRAM_CHANNEL,
        enabled: false,
        verified: false,
        verificationCode,
        telegramBotToken: encryptSecret(
          token,
          notificationSecretContext({ userId: ownerId }, "telegramBotToken", ownerId)
        ),
        config: { digestMode },
      },
      update: {
        enabled: false,
        verified: false,
        verificationCode,
        telegramBotToken: encryptSecret(
          token,
          notificationSecretContext({ userId: ownerId }, "telegramBotToken", ownerId)
        ),
        telegramChatId: null,
        failureCount: 0,
        config: { digestMode },
      },
    })
  );

  return sanitizeChannel(channel);
}

async function verifyTelegramConnection(userId) {
  const ownerId = requireUserId(userId);
  const channel = await getTelegramChannel(ownerId);
  if (!channel?.telegramBotToken || !channel.verificationCode) {
    throw new Error("Telegram channel is not configured.");
  }

  const token = maybeDecrypt(
    channel.telegramBotToken,
    notificationSecretContext(channel, "telegramBotToken", ownerId)
  );
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates`
  );
  if (!response.ok) {
    throw new Error(`Telegram verification failed with status ${response.status}.`);
  }
  const payload = await response.json();
  const updates = Array.isArray(payload?.result) ? payload.result : [];
  const expected = `/connect ${channel.verificationCode}`;
  const match = updates.find((update) => {
    const text = update?.message?.text || "";
    return text.trim().toUpperCase() === expected.toUpperCase();
  });
  const chatId = match?.message?.chat?.id;
  if (!chatId) {
    return {
      verified: false,
      verificationCode: channel.verificationCode,
      message: `Send /connect ${channel.verificationCode} to your Telegram bot, then verify again.`,
    };
  }

  const verified = await prisma.run((db) =>
    db.notificationChannel.update({
      where: { id: channel.id },
      data: {
        enabled: true,
        verified: true,
        telegramChatId: encryptSecret(
          String(chatId),
          notificationSecretContext(channel, "telegramChatId", ownerId)
        ),
        verificationCode: null,
        failureCount: 0,
      },
    })
  );
  return sanitizeChannel(verified);
}

async function queueAlertDelivery(userId, alert, tx = null) {
  const ownerId = requireUserId(userId);
  if (!alert?.id) return null;
  const db = tx || prisma;
  const channel = await db.notificationChannel.findFirst({
    where: {
      userId: ownerId,
      channel: TELEGRAM_CHANNEL,
      enabled: true,
      verified: true,
      failureCount: { lt: 10 },
    },
  });
  if (!channel) return null;
  if ((channel.config?.digestMode || "immediate") !== "immediate") {
    return null;
  }
  return db.alertDelivery.create({
    data: {
      userId: ownerId,
      alertId: alert.id,
      channelId: channel.id,
      status: "PENDING",
      nextAttemptAt: new Date(),
      payload: {
        channel: TELEGRAM_CHANNEL,
        alertId: alert.id,
      },
    },
  });
}

async function sendTelegram(channel, alert) {
  const normalizedChannel = await migrateLegacyTelegramSecrets(channel);
  const token = maybeDecrypt(
    normalizedChannel.telegramBotToken,
    notificationSecretContext(normalizedChannel, "telegramBotToken")
  );
  const chatId = maybeDecrypt(
    normalizedChannel.telegramChatId,
    notificationSecretContext(normalizedChannel, "telegramChatId")
  );
  if (!token || !chatId) {
    throw new Error("Telegram channel is missing verified token/chat id.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        text: formatTelegramMessage(alert),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Telegram delivery failed with status ${response.status}.`);
  }
}

async function processDueDeliveries(userId = null) {
  const ownerId = userId ? requireUserId(userId) : null;
  const now = new Date();
  const deliveries = await prisma.run((db) =>
    db.alertDelivery.findMany({
      where: {
        ...(ownerId ? { userId: ownerId } : {}),
        status: { in: ["PENDING", "RETRYING"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: {
        alert: true,
        channel: true,
      },
      orderBy: { createdAt: "asc" },
      take: 25,
    })
  );

  const results = [];
  for (const delivery of deliveries) {
    try {
      await prisma.run((db) =>
        db.alertDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENDING", lastAttemptAt: now },
        })
      );
      await sendTelegram(delivery.channel, delivery.alert);
      await prisma.run((db) =>
        db.$transaction([
          db.alertDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "SENT",
              attempts: { increment: 1 },
              sentAt: new Date(),
              failureReason: null,
            },
          }),
          db.notificationChannel.update({
            where: { id: delivery.channelId },
            data: {
              lastDeliveryAt: new Date(),
              failureCount: 0,
            },
          }),
          db.alert.update({
            where: { id: delivery.alertId },
            data: {
              sentAt: new Date(),
              channel: TELEGRAM_CHANNEL,
            },
          }),
        ])
      );
      results.push({ id: delivery.id, status: "SENT" });
    } catch (error) {
      const nextAttempts = delivery.attempts + 1;
      const nextStatus = nextAttempts >= 3 ? "FAILED" : "RETRYING";
      const nextAttemptAt =
        nextStatus === "RETRYING"
          ? new Date(Date.now() + RETRY_DELAYS_MS[nextAttempts - 1])
          : null;
      await prisma.run((db) =>
        db.$transaction([
          db.alertDelivery.update({
            where: { id: delivery.id },
            data: {
              status: nextStatus,
              attempts: { increment: 1 },
              nextAttemptAt,
              failureReason: error.message,
            },
          }),
          db.notificationChannel.update({
            where: { id: delivery.channelId },
            data: {
              failureCount: { increment: 1 },
              ...(delivery.channel.failureCount + 1 >= 10
                ? { enabled: false }
                : {}),
            },
          }),
        ])
      );
      results.push({ id: delivery.id, status: nextStatus, error: error.message });
    }
  }
  return { processed: results.length, results };
}

async function sendTestAlert(userId) {
  const ownerId = requireUserId(userId);
  const alert = await alertRepository.upsertAlert(ownerId, {
    category: "SYSTEM",
    source: "MANUAL",
    severity: "INFO",
    symbol: "SYSTEM",
    score: 0,
    title: "Telegram test alert",
    message: "Your trading cockpit Telegram channel is connected.",
    metadata: { test: true },
  });
  await prisma.run((db) => queueAlertDelivery(ownerId, alert, db));
  return processDueDeliveries(ownerId);
}

module.exports = {
  formatTelegramMessage,
  getNotificationChannels,
  processDueDeliveries,
  queueAlertDelivery,
  saveTelegramConfig,
  sendTestAlert,
  verifyTelegramConnection,
};
