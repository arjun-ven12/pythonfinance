function createIbkrService({
  appendOutput,
  getPythonPath,
  ibkrBrokerActionPath,
  ibkrConnectionTestPath,
  normalizeBrokerExecutionMode,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  spawn,
}) {
  function normalizeIbkrMode(value, fallback = "paper") {
    const mode = String(value || fallback).trim().toLowerCase();
    return mode === "live" ? "live" : "paper";
  }

  function parseIbkrPort(value, mode = "paper") {
    const fallback = mode === "live" ? 7496 : 7497;
    const parsed = Number.parseInt(value ?? fallback, 10);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error("IBKR port must be between 1 and 65535.");
    }

    return parsed;
  }

  function parseIbkrClientId(value) {
    const parsed = Number.parseInt(value ?? 11, 10);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999999) {
      throw new Error("IBKR clientId must be between 0 and 999999.");
    }

    return parsed;
  }

  function sanitizeIbkrHost(value) {
    const host = String(value || "127.0.0.1").trim();

    if (!host || host.length > 120 || /[^\w.:-]/.test(host)) {
      throw new Error("IBKR host must be a valid hostname or IP address.");
    }

    return host;
  }

  function getEnvIbkrConfig() {
    const mode = normalizeIbkrMode(process.env.IBKR_MODE);

    return {
      host: sanitizeIbkrHost(process.env.IBKR_HOST || "127.0.0.1"),
      port: parseIbkrPort(process.env.IBKR_PORT, mode),
      clientId: parseIbkrClientId(process.env.IBKR_CLIENT_ID),
      mode,
      source: process.env.IBKR_HOST || process.env.IBKR_PORT || process.env.IBKR_CLIENT_ID
        ? "env"
        : "default",
    };
  }

  function buildIbkrConfig(input = {}, existingConfig = {}) {
    let envConfig;

    try {
      envConfig = getEnvIbkrConfig();
    } catch (_error) {
      envConfig = {
        host: "127.0.0.1",
        port: 7497,
        clientId: 11,
        mode: "paper",
        source: "default",
      };
    }
    const merged = {
      ...envConfig,
      ...existingConfig,
      ...input,
    };
    const mode = normalizeIbkrMode(merged.mode);

    return {
      host: sanitizeIbkrHost(merged.host),
      port: parseIbkrPort(merged.port, mode),
      clientId: parseIbkrClientId(merged.clientId ?? merged.client_id),
      mode,
      executionMode: normalizeBrokerExecutionMode(
        merged.executionMode ?? merged.execution_mode ?? "READ_ONLY"
      ),
      source: merged.source || envConfig.source,
      last_checked_at: merged.last_checked_at || null,
      last_error: merged.last_error || null,
      last_connected: Boolean(merged.last_connected),
      server_time: merged.server_time || null,
      account_summary_available: Boolean(merged.account_summary_available),
    };
  }

  function getIbkrStatus(config = buildIbkrConfig()) {
    const configured =
      config.source !== "default" ||
      Boolean(process.env.IBKR_HOST || process.env.IBKR_PORT || process.env.IBKR_CLIENT_ID);
    let status = configured ? "CONFIGURED" : "NOT_CONFIGURED";

    if (config.last_checked_at && config.last_connected) {
      status = "CONNECTED";
    } else if (config.last_checked_at && config.last_error) {
      status = "ERROR";
    }

    return {
      status,
      host: config.host,
      port: config.port,
      clientId: config.clientId,
      mode: config.mode,
      executionMode: config.executionMode,
      last_checked_at: config.last_checked_at,
      server_time: config.server_time,
      account_summary_available: config.account_summary_available,
      error: config.last_error,
    };
  }

  async function readUserIbkrConfig(userId) {
    const record = await prisma.run((db) =>
      db.brokerConfig.findUnique({ where: { userId } })
    );
    return buildIbkrConfig(
      { executionMode: record?.executionMode || "READ_ONLY" },
      record?.config || {}
    );
  }

  async function writeUserIbkrConfig(userId, config) {
    const safeConfig = buildIbkrConfig(
      { ...config, source: "config" },
      await readUserIbkrConfig(userId)
    );
    await prisma.run((db) =>
      db.brokerConfig.upsert({
        where: { userId },
        update: {
          provider: "IBKR",
          executionMode: safeConfig.executionMode,
          config: safeConfig,
        },
        create: {
          userId,
          provider: "IBKR",
          executionMode: safeConfig.executionMode,
          config: safeConfig,
        },
      })
    );
    return safeConfig;
  }

  function buildIbkrConnectionResult(config, overrides = {}) {
    return {
      connected: false,
      mode: config.mode,
      host: config.host,
      port: config.port,
      client_id: config.clientId,
      server_time: null,
      account_summary_available: false,
      dependency_available: null,
      socket_reachable: null,
      setup_hint: null,
      error: null,
      ...overrides,
    };
  }

  function runIbkrConnectionTest(config) {
    return new Promise((resolve) => {
      const args = [
        ibkrConnectionTestPath,
        "--host",
        config.host,
        "--port",
        String(config.port),
        "--client-id",
        String(config.clientId),
        "--mode",
        config.mode,
      ];
      const pythonPath = getPythonPath();
      const child = spawn(pythonPath, args, {
        cwd: pythonEngineDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        child.kill("SIGTERM");
        resolve(buildIbkrConnectionResult(config, {
          error: "IBKR connection test timed out. Confirm TWS or IB Gateway is open and API socket clients are enabled.",
          stderr,
          stdout,
          python_path: pythonPath,
        }));
      }, 10000);

      const resolveOnce = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", (error) => {
        resolveOnce(buildIbkrConnectionResult(config, {
          error: `Unable to start Python IBKR connection test: ${error.message}`,
          stderr,
          stdout,
          python_path: pythonPath,
        }));
      });

      child.on("close", (code) => {
        try {
          const result = parseJsonOutput(stdout);

          resolveOnce(buildIbkrConnectionResult(config, {
            ...result,
            connected: Boolean(result.connected),
            error:
              result.error ||
              (!result.connected && stderr ? stderr : null) ||
              (code ? `IBKR test exited with code ${code}.` : null),
            stderr: stderr || null,
            stdout: stdout || null,
            exit_code: code,
            python_path: pythonPath,
          }));
        } catch (error) {
          resolveOnce(buildIbkrConnectionResult(config, {
            error: `IBKR connection test did not return valid JSON: ${error.message}`,
            stderr,
            stdout,
            exit_code: code,
            python_path: pythonPath,
          }));
        }
      });
    });
  }

  function runIbkrBrokerAction(config, action, payload = {}) {
    return new Promise((resolve) => {
      const args = [
        ibkrBrokerActionPath,
        "--action",
        String(action),
        "--host",
        config.host,
        "--port",
        String(config.port),
        "--client-id",
        String(config.clientId),
        "--mode",
        config.mode,
      ];

      if (payload.symbol) {
        args.push("--symbol", String(payload.symbol).trim().toUpperCase());
      }
      if (payload.side) {
        args.push("--side", String(payload.side).trim().toUpperCase());
      }
      if (payload.orderType || payload.order_type) {
        args.push(
          "--order-type",
          String(payload.orderType || payload.order_type).trim().toUpperCase()
        );
      }
      if (payload.quantity != null) {
        args.push("--quantity", String(payload.quantity));
      }
      if (payload.limitPrice != null || payload.limit_price != null) {
        args.push(
          "--limit-price",
          String(payload.limitPrice ?? payload.limit_price)
        );
      }
      if (payload.clientOrderId || payload.client_order_id) {
        args.push(
          "--client-order-id",
          String(payload.clientOrderId || payload.client_order_id)
        );
      }
      if (payload.brokerOrderId || payload.broker_order_id) {
        args.push(
          "--broker-order-id",
          String(payload.brokerOrderId || payload.broker_order_id)
        );
      }

      const pythonPath = getPythonPath();
      const child = spawn(pythonPath, args, {
        cwd: pythonEngineDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        child.kill("SIGTERM");
        resolve({
          success: false,
          action,
          error: `IBKR broker action timed out: ${action}`,
          stdout,
          stderr,
          python_path: pythonPath,
        });
      }, 15000);

      const resolveOnce = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", (error) => {
        resolveOnce({
          success: false,
          action,
          error: `Unable to start Python IBKR broker action: ${error.message}`,
          stdout,
          stderr,
          python_path: pythonPath,
        });
      });

      child.on("close", (code) => {
        try {
          const result = parseJsonOutput(stdout);
          resolveOnce({
            ...result,
            stdout: stdout || null,
            stderr: stderr || null,
            exit_code: code,
            python_path: pythonPath,
          });
        } catch (error) {
          resolveOnce({
            success: false,
            action,
            error: `IBKR broker action did not return valid JSON: ${error.message}`,
            stdout,
            stderr,
            exit_code: code,
            python_path: pythonPath,
          });
        }
      });
    });
  }

  return {
    buildIbkrConfig,
    getIbkrStatus,
    normalizeIbkrMode,
    readUserIbkrConfig,
    runIbkrBrokerAction,
    runIbkrConnectionTest,
    writeUserIbkrConfig,
  };
}

module.exports = createIbkrService;
