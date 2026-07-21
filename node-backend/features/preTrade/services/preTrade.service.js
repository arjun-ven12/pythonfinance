function createPreTradeService({
  appendOutput,
  getDefaultExecutionSettings,
  getPortfolioForUser,
  getProcessFailureMessage,
  getPythonAiGatewayEnv = () => ({}),
  getPythonPath,
  getTradingHorizon,
  parseJsonOutput,
  preTradeAnalyzerPath,
  pythonEngineDir,
  readActiveStrategyConfig,
  readScanResultsWithHistory,
  readUserSafetyStatus,
  readUserSetting,
  requireUserId,
  spawn,
  validateSymbol,
}) {
  function parseRequiredTradeNumber(value, fieldName) {
    const parsed = Number.parseFloat(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${fieldName} must be greater than 0.`);
    }

    return parsed;
  }

  function buildPreTradeAnalysisArgs(userId, body = {}, context = {}) {
    const symbol = validateSymbol(body.symbol);
    const side = String(body.side || "").trim().toUpperCase();

    if (!["BUY", "SELL"].includes(side)) {
      throw new Error("Side must be BUY or SELL.");
    }

    return [
      preTradeAnalyzerPath,
      "--user-id",
      userId,
      "--symbol",
      symbol,
      "--side",
      side,
      "--quantity",
      String(parseRequiredTradeNumber(body.quantity, "quantity")),
      "--entry-price",
      String(
        parseRequiredTradeNumber(
          body.entryPrice ?? body.entry_price,
          "entry price"
        )
      ),
      "--stop-loss",
      String(parseRequiredTradeNumber(body.stopLoss ?? body.stop_loss, "stop loss")),
      "--take-profit",
      String(
        parseRequiredTradeNumber(
          body.takeProfit ?? body.take_profit,
          "take profit"
        )
      ),
      "--horizon",
      getTradingHorizon(body.horizon ?? context.horizon ?? "SWING"),
      "--context-stdin",
      ...(body.simulationMode || body.simulation_mode ? ["--simulation-mode"] : []),
    ];
  }

  async function buildPreTradeContext(userId, body = {}) {
    const [
      portfolio,
      scanResults,
      safetyStatus,
      activeStrategy,
      executionSettings,
      horizon,
    ] = await Promise.all([
      getPortfolioForUser(userId),
      readScanResultsWithHistory(userId),
      readUserSafetyStatus(userId),
      readActiveStrategyConfig(userId),
      readUserSetting(userId, "execution_settings", getDefaultExecutionSettings()),
      readUserSetting(userId, "trading_horizon", "SWING"),
    ]);

    return {
      portfolio_state: portfolio.ledgerState || {},
      scan_results: scanResults || {},
      safety_status: safetyStatus || {},
      active_strategy: activeStrategy || null,
      execution_settings: executionSettings || {},
      horizon: body.horizon ?? horizon ?? "SWING",
    };
  }

  async function runPreTradeAnalysis(userId, body) {
    const ownerId = requireUserId(userId);
    const context = await buildPreTradeContext(ownerId, body || {});

    return new Promise((resolve, reject) => {
      const child = spawn(
        getPythonPath(),
        buildPreTradeAnalysisArgs(ownerId, body || {}, context),
        {
          cwd: pythonEngineDir,
          env: {
            ...process.env,
            ...getPythonAiGatewayEnv(ownerId),
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });
      child.on("error", reject);
      child.stdin.on("error", (error) => {
        stderr = appendOutput(stderr, Buffer.from(error.message));
      });
      child.stdin.end(JSON.stringify(context));
      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error(
            getProcessFailureMessage("Pre-trade analysis failed", stderr)
          );
          error.details = { code, stdout, stderr };
          reject(error);
          return;
        }

        try {
          resolve(parseJsonOutput(stdout));
        } catch (error) {
          error.details = { stdout, stderr };
          reject(error);
        }
      });
    });
  }

  return {
    buildPreTradeAnalysisArgs,
    runPreTradeAnalysis,
  };
}

module.exports = createPreTradeService;
