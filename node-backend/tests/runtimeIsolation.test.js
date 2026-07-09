const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const prisma = require("../services/prisma");
const runtime = require("../services/userRuntime");
const alertDeliveryService = require("../services/alertDeliveryService");
const { encryptSecret } = require("../services/encryptionService");

test("user runtime files use separate directories", () => {
  const userA = runtime.getUserRuntimePath("user-a", "scanResults");
  const userB = runtime.getUserRuntimePath("user-b", "scanResults");

  assert.notEqual(path.dirname(userA), path.dirname(userB));
  assert.match(userA, /runtime\/users\/user-a\/scan_results\.json$/);
  assert.match(userB, /runtime\/users\/user-b\/scan_results\.json$/);
});

test("Telegram delivery loads only the alert owner's channel", async () => {
  const originalRun = prisma.run;
  const originalFetch = global.fetch;
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  let queriedWhere = null;
  let requestedUrl = null;
  const updates = [];

  process.env.APP_ENCRYPTION_KEY_CURRENT =
    "current:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

  prisma.run = async (operation) =>
    operation({
      $transaction: async (operations) => Promise.all(operations),
      alert: {
        update: async (args) => {
          updates.push(["alert", args]);
          return args;
        },
      },
      alertDelivery: {
        findMany: async ({ where }) => {
          queriedWhere = where;
          return [
            {
              id: "delivery-b",
              userId: "user-b",
              alertId: "alert-b",
              channelId: "channel-b",
              attempts: 0,
              alert: {
                id: "alert-b",
                userId: "user-b",
                category: "SCANNER",
                symbol: "MSFT",
                score: 80,
                confidence: 90,
                metadata: {},
              },
              channel: {
                id: "channel-b",
                userId: "user-b",
                channel: "TELEGRAM",
                enabled: true,
                verified: true,
                failureCount: 0,
                telegramBotToken: encryptSecret("user-b-token", {
                  scope: "notification_channel",
                  userId: "user-b",
                  channel: "TELEGRAM",
                  channelId: "channel-b",
                  field: "telegramBotToken",
                }),
                telegramChatId: encryptSecret("user-b-chat", {
                  scope: "notification_channel",
                  userId: "user-b",
                  channel: "TELEGRAM",
                  channelId: "channel-b",
                  field: "telegramChatId",
                }),
                config: {},
              },
            },
          ];
        },
        update: async (args) => {
          updates.push(["delivery", args]);
          return args;
        },
      },
      notificationChannel: {
        update: async (args) => {
          updates.push(["channel", args]);
          return args;
        },
      },
    });
  global.fetch = async (url, options = {}) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ ok: true, options }) };
  };

  try {
    const result = await alertDeliveryService.processDueDeliveries("user-b");

    assert.equal(result.processed, 1);
    assert.equal(queriedWhere.userId, "user-b");
    assert.match(requestedUrl, /user-b-token/);
    assert.doesNotMatch(requestedUrl, /user-a/);
    assert.ok(updates.some(([type]) => type === "delivery"));
  } finally {
    prisma.run = originalRun;
    global.fetch = originalFetch;
    process.env.APP_ENCRYPTION_KEY_CURRENT = originalEncryptionKey;
  }
});
