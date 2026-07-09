const assert = require("node:assert/strict");
const test = require("node:test");

const prisma = require("../services/prisma");
const alertDeliveryService = require("../services/alertDeliveryService");
const { decryptSecret } = require("../services/encryptionService");

const CURRENT_KEY =
  "current:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("legacy plaintext telegram config is migrated into encrypted columns", async () => {
  const originalRun = prisma.run;
  const originalKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;
  const updates = [];

  prisma.run = async (operation) =>
    operation({
      notificationChannel: {
        findMany: async () => [
          {
            id: "channel-1",
            userId: "user-1",
            channel: "TELEGRAM",
            enabled: true,
            verified: true,
            telegramBotToken: null,
            telegramChatId: null,
            config: {
              digestMode: "immediate",
              telegramToken: "legacy-token",
              telegramChatId: "legacy-chat",
            },
          },
        ],
        update: async ({ data }) => {
          updates.push(data);
          return {
            id: "channel-1",
            userId: "user-1",
            channel: "TELEGRAM",
            enabled: true,
            verified: true,
            ...data,
          };
        },
      },
    });

  try {
    const channels = await alertDeliveryService.getNotificationChannels("user-1");

    assert.equal(channels[0].hasTelegramBotToken, true);
    assert.equal(channels[0].hasTelegramChatId, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].config.telegramToken, undefined);
    assert.equal(updates[0].config.telegramChatId, undefined);
    assert.ok(String(updates[0].telegramBotToken).startsWith("v1:current:"));
    assert.equal(
      decryptSecret(updates[0].telegramBotToken, {
        scope: "notification_channel",
        channel: "TELEGRAM",
        channelId: "channel-1",
        userId: "user-1",
        field: "telegramBotToken",
      }),
      "legacy-token"
    );
  } finally {
    prisma.run = originalRun;
    process.env.APP_ENCRYPTION_KEY_CURRENT = originalKey;
  }
});

test("telegram secrets cannot be stored plaintext when encryption key is missing", async () => {
  const originalRun = prisma.run;
  const originalEnvironment = process.env.NODE_ENV;
  const originalKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.NODE_ENV = "development";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;

  prisma.run = async (operation) =>
    operation({
      notificationChannel: {
        upsert: async ({ create }) => create,
      },
    });

  try {
    await assert.rejects(
      () =>
        alertDeliveryService.saveTelegramConfig("user-1", {
          telegramBotToken: "plain-token",
        }),
      /APP_ENCRYPTION_KEY_CURRENT/
    );
  } finally {
    prisma.run = originalRun;
    process.env.NODE_ENV = originalEnvironment;
    process.env.APP_ENCRYPTION_KEY_CURRENT = originalKey;
  }
});
