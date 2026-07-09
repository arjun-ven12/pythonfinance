const { Redis } = require("@upstash/redis");

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function createRedisCacheProvider({ env = process.env } = {}) {
  const enabled =
    toBoolean(env.REDIS_ENABLED) &&
    typeof env.UPSTASH_REDIS_REST_URL === "string" &&
    env.UPSTASH_REDIS_REST_URL.trim() &&
    typeof env.UPSTASH_REDIS_REST_TOKEN === "string" &&
    env.UPSTASH_REDIS_REST_TOKEN.trim();

  if (!enabled) {
    return {
      enabled: false,
      async delete() {
        return false;
      },
      async get() {
        return null;
      },
      async set() {
        return null;
      },
    };
  }

  const client = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return {
    enabled: true,

    async delete(key) {
      await client.del(key);
      return true;
    },

    async get(key) {
      const entry = await client.get(key);
      if (!entry || typeof entry !== "object") {
        return null;
      }

      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        await client.del(key).catch(() => {});
        return null;
      }

      return entry;
    },

    async set(key, value, ttlMs) {
      const ttlSeconds = Math.max(1, Math.ceil(Number(ttlMs || 0) / 1000));
      const entry = {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
        storedAt: Date.now(),
      };
      await client.set(key, entry, { ex: ttlSeconds });
      return entry;
    },
  };
}

module.exports = createRedisCacheProvider;
