function createStockUniversesService({
  appendOutput,
  getPythonPath,
  normalizeStoredOpportunity,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  requireUserId,
  spawn,
  storedScanWithOpportunitiesSelect,
  watchlistRepository,
}) {
function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function validateSymbol(value) {
  const symbol = normalizeSymbol(value);

  if (!symbol || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) {
    throw new Error("Symbol must be 1-12 letters, numbers, dots, or dashes.");
  }

  return symbol;
}

function normalizeSymbolList(values = []) {
  const symbols = Array.isArray(values)
    ? values
    : String(values || "").split(",");
  const normalizedSymbols = symbols
    .map((symbol) => validateSymbol(symbol))
    .filter(Boolean);

  return [...new Set(normalizedSymbols)];
}

function getBacktestSymbols(config = {}) {
  const symbols = normalizeSymbolList(
    config.symbols || config.symbolList || config.symbol || "AAPL"
  );

  if (symbols.length === 0) {
    throw new Error("At least one symbol is required.");
  }

  if (symbols.length > 25) {
    throw new Error("Backtesting supports up to 25 symbols per request.");
  }

  return symbols;
}

const STOCK_UNIVERSE_TYPES = new Set([
  "MANUAL",
  "WATCHLIST",
  "SECTOR",
  "INDUSTRY",
  "S_AND_P_500_SAMPLE",
  "CUSTOM_SCREEN",
]);

function normalizeStockUniverseType(value, fallback = "MANUAL") {
  const type = String(value || fallback).trim().toUpperCase();
  return STOCK_UNIVERSE_TYPES.has(type) ? type : fallback;
}

function prismaStockUniverseAvailable(db) {
  return Boolean(db.stockUniverse && db.stockUniverseMember);
}

function normalizeUniverseMember(input, source = "manual") {
  const symbol = validateSymbol(input?.symbol || input);

  return {
    symbol,
    companyName: input?.companyName || input?.company_name || null,
    sector: input?.sector || null,
    industry: input?.industry || null,
    source: input?.source || source,
  };
}

function normalizeUniverseMembers(values = [], source = "manual") {
  const membersBySymbol = new Map();
  const list = Array.isArray(values)
    ? values
    : String(values || "").split(",");

  for (const value of list) {
    const member = normalizeUniverseMember(value, source);
    membersBySymbol.set(member.symbol, member);
  }

  return [...membersBySymbol.values()];
}

async function getLatestScanOpportunities(userId) {
  try {
    const latestScan = await prisma.run((db) =>
      db.scan.findFirst({
        where: { userId },
        orderBy: { generatedAt: "desc" },
        select: storedScanWithOpportunitiesSelect,
      })
    );
    return (latestScan?.opportunities || []).map((opportunity) =>
      normalizeStoredOpportunity(opportunity, latestScan)
    );
  } catch (_error) {
    return [];
  }
}

async function buildUniverseMembersFromSource(userId, body = {}) {
  const source = String(body.source || "").trim().toUpperCase();

  if (body.members !== undefined) {
    return normalizeUniverseMembers(body.members, source || "manual");
  }

  if (body.symbols !== undefined || body.symbol !== undefined) {
    return normalizeUniverseMembers(body.symbols || body.symbol, source || "manual");
  }

  if (source === "WATCHLIST" || body.universeType === "WATCHLIST") {
    return (await getWatchlistSymbolsFromDatabase(userId)).map((symbol) =>
      normalizeUniverseMember({ symbol, source: "watchlist" })
    );
  }

  const opportunities = await getLatestScanOpportunities(userId);

  if (source === "SCANNER_RESULTS" || source === "SCANNER") {
    return normalizeUniverseMembers(
      opportunities.map((opportunity) => ({
        symbol: opportunity.symbol,
        sector: opportunity.sector,
        industry: opportunity.industry,
        source: "scanner",
      })),
      "scanner"
    );
  }

  if (body.sector) {
    return normalizeUniverseMembers(
      opportunities
        .filter((opportunity) => opportunity.sector === body.sector)
        .map((opportunity) => ({
          symbol: opportunity.symbol,
          sector: opportunity.sector,
          industry: opportunity.industry,
          source: "sector",
        })),
      "sector"
    );
  }

  if (body.industry) {
    return normalizeUniverseMembers(
      opportunities
        .filter((opportunity) => opportunity.industry === body.industry)
        .map((opportunity) => ({
          symbol: opportunity.symbol,
          sector: opportunity.sector,
          industry: opportunity.industry,
          source: "industry",
        })),
      "industry"
    );
  }

  return [];
}

function normalizeStockUniverse(universe) {
  return {
    id: universe.id,
    name: universe.name,
    description: universe.description || "",
    universeType: universe.universeType,
    createdAt: universe.createdAt,
    updatedAt: universe.updatedAt,
    members: universe.members || [],
    symbols: (universe.members || []).map((member) => member.symbol),
  };
}

async function listStockUniverses(userId) {
  try {
    return await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      const universes = await db.stockUniverse.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          members: {
            orderBy: { symbol: "asc" },
          },
        },
      });

      return universes.map(normalizeStockUniverse);
    });
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function getStockUniverseById(userId, id) {
  const universeId = String(id || "");

  try {
    return await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      const universe = await db.stockUniverse.findFirst({
        where: { id: universeId, userId },
        include: {
          members: {
            orderBy: { symbol: "asc" },
          },
        },
      });

      return universe ? normalizeStockUniverse(universe) : null;
    });
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

function ensureStockUniverseFound(universe) {
  if (!universe) {
    const error = new Error("Stock universe not found.");
    error.statusCode = 404;
    throw error;
  }

  return universe;
}

async function createStockUniverse(userId, body = {}) {
  const name = String(body.name || "").trim();

  if (!name) {
    const error = new Error("Universe name is required.");
    error.statusCode = 400;
    throw error;
  }

  const members = await buildUniverseMembersFromSource(userId, body);
  const universeType = normalizeStockUniverseType(body.universeType || body.type);
  const description = String(body.description || "").trim() || null;

  try {
    return await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      const universe = await db.stockUniverse.create({
        data: {
          userId,
          name,
          description,
          universeType,
          members: {
            create: members,
          },
        },
        include: {
          members: {
            orderBy: { symbol: "asc" },
          },
        },
      });

      return normalizeStockUniverse(universe);
    });
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function updateStockUniverse(userId, id, body = {}) {
  const existing = ensureStockUniverseFound(await getStockUniverseById(userId, id));
  const patch = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) {
      const error = new Error("Universe name cannot be empty.");
      error.statusCode = 400;
      throw error;
    }
    patch.name = name;
  }

  if (body.description !== undefined) {
    patch.description = String(body.description || "").trim() || null;
  }

  if (body.universeType !== undefined || body.type !== undefined) {
    patch.universeType = normalizeStockUniverseType(body.universeType || body.type);
  }

  const replaceMembers =
    body.members !== undefined ||
    body.symbols !== undefined ||
    body.symbol !== undefined ||
    body.source !== undefined ||
    body.sector !== undefined ||
    body.industry !== undefined;
  const members = replaceMembers
    ? await buildUniverseMembersFromSource(userId, body)
    : null;

  try {
    return await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      const updated = await db.stockUniverse.updateMany({
        where: { id: existing.id, userId },
        data: patch,
      });
      if (updated.count !== 1) {
        return null;
      }
      if (replaceMembers) {
        await db.stockUniverseMember.deleteMany({
          where: { universeId: existing.id },
        });
        await db.stockUniverseMember.createMany({
          data: members.map((member) => ({
            ...member,
            universeId: existing.id,
          })),
          skipDuplicates: true,
        });
      }
      const universe = await db.stockUniverse.findFirst({
        where: { id: existing.id, userId },
        include: {
          members: {
            orderBy: { symbol: "asc" },
          },
        },
      });
      return universe ? normalizeStockUniverse(universe) : null;
    });
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function deleteStockUniverse(userId, id) {
  const existing = ensureStockUniverseFound(await getStockUniverseById(userId, id));

  try {
    await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      const deleted = await db.stockUniverse.deleteMany({
        where: { id: existing.id, userId },
      });
      if (deleted.count !== 1) {
        ensureStockUniverseFound(null);
      }
    });
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function addStockUniverseMembers(userId, id, body = {}) {
  const existing = ensureStockUniverseFound(await getStockUniverseById(userId, id));
  const members = await buildUniverseMembersFromSource(userId, body);

  try {
    await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      await db.stockUniverseMember.createMany({
        data: members.map((member) => ({
          ...member,
          universeId: existing.id,
        })),
        skipDuplicates: true,
      });
    });

    return ensureStockUniverseFound(
      await getStockUniverseById(userId, existing.id)
    );
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function removeStockUniverseMember(userId, id, symbolValue) {
  const existing = ensureStockUniverseFound(await getStockUniverseById(userId, id));
  const symbol = validateSymbol(symbolValue);

  try {
    await prisma.run(async (db) => {
      if (!prismaStockUniverseAvailable(db)) {
        throw new Error("StockUniverse Prisma model unavailable.");
      }

      await db.stockUniverseMember.deleteMany({
        where: { universeId: existing.id, symbol },
      });
    });

    return ensureStockUniverseFound(
      await getStockUniverseById(userId, existing.id)
    );
  } catch (error) {
    error.statusCode = error.statusCode || 503;
    throw error;
  }
}

async function resolveUniverseSymbols(userId, universeId) {
  const universe = ensureStockUniverseFound(
    await getStockUniverseById(userId, universeId)
  );
  return normalizeSymbolList(universe.symbols || []);
}

function getSp500SampleSymbols(limit = 10) {
  return new Promise((resolve, reject) => {
    const sampleLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 10, 100));
    const script = [
      "import json, sys",
      "from universe import get_sp500_symbols",
      "limit = int(sys.argv[1])",
      "print(json.dumps(get_sp500_symbols(limit)))",
    ].join("\n");
    const child = spawn(getPythonPath(), ["-c", script, String(sampleLimit)], {
      cwd: pythonEngineDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error("Unable to load S&P 500 sample.");
        error.details = { code, stdout, stderr };
        reject(error);
        return;
      }

      try {
        resolve(normalizeSymbolList(parseJsonOutput(stdout)));
      } catch (error) {
        error.details = { stdout, stderr };
        reject(error);
      }
    });
  });
}

async function resolveBacktestUniversePayload(userId, config = {}) {
  const universeMode = String(config.universeMode || "").trim().toUpperCase();

  if (universeMode === "SP500_TOP_N" || universeMode === "S_AND_P_500_SAMPLE") {
    const symbols = await getSp500SampleSymbols(config.topN || config.limit || 10);

    return {
      ...config,
      symbols,
      symbol: symbols[0],
    };
  }

  if (!config.universeId) {
    return config;
  }

  const symbols = await resolveUniverseSymbols(userId, config.universeId);

  if (symbols.length === 0) {
    throw new Error("Selected stock universe has no symbols.");
  }

  return {
    ...config,
    symbols,
    symbol: symbols[0],
  };
}

async function getWatchlistSymbolsFromDatabase(userId) {
  const items = await watchlistRepository.list(userId);

  return normalizeSymbolList(items.map((item) => item.symbol));
}

async function getRequestedScanSymbols(body = {}, userId) {
  requireUserId(userId);
  if (body.universeId) {
    const symbols = await resolveUniverseSymbols(userId, body.universeId);

    if (symbols.length === 0) {
      const error = new Error("Selected stock universe has no symbols.");
      error.statusCode = 400;
      throw error;
    }

    return symbols;
  }

  const scanSymbolsOnly = Boolean(
    body.scanSymbolsOnly ||
    body.symbolsOnly ||
    body.directSymbolsOnly
  );

  if (scanSymbolsOnly) {
    let symbols = [];

    try {
      symbols = normalizeSymbolList(body.symbols || body.symbol || []);
    } catch (error) {
      error.statusCode = 400;
      throw error;
    }

    if (symbols.length === 0) {
      const error = new Error("At least one symbol is required for a direct symbol scan.");
      error.statusCode = 400;
      throw error;
    }

    return symbols;
  }

  const scanWatchlistOnly = Boolean(
    body.scanWatchlistOnly ||
    body.watchlistOnly ||
    body.scan_watchlist_only
  );

  if (!scanWatchlistOnly) {
    return [];
  }

  let providedSymbols = [];

  try {
    providedSymbols = normalizeSymbolList(
      body.watchlistSymbols || body.symbols || body.watchlist || []
    );
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }

  const symbols =
    providedSymbols.length > 0
      ? providedSymbols
      : await getWatchlistSymbolsFromDatabase(userId);

  if (symbols.length === 0) {
    const error = new Error("Scan watchlist only is enabled, but the watchlist is empty.");
    error.statusCode = 400;
    throw error;
  }

  return symbols;
}



  return {
    addStockUniverseMembers,
    createStockUniverse,
    deleteStockUniverse,
    getBacktestSymbols,
    getRequestedScanSymbols,
    getStockUniverseById,
    listStockUniverses,
    normalizeSymbol,
    normalizeSymbolList,
    removeStockUniverseMember,
    resolveBacktestUniversePayload,
    updateStockUniverse,
    validateSymbol,
  };
}

module.exports = createStockUniversesService;
