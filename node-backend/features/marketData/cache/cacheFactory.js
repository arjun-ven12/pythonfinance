const createMemoryCacheProvider = require("./memoryCacheProvider");
const createRedisCacheProvider = require("./redisCacheProvider");

function createCacheFactory({ env = process.env } = {}) {
  const memory = createMemoryCacheProvider();
  const redis = createRedisCacheProvider({ env });

  return {
    memory,
    redis,
  };
}

module.exports = createCacheFactory;
