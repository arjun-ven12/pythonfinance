const { redactSensitive } = require("../../../services/redactionService");

function createBrokerController(deps) {
  const {
    brokerSecretService,
    buildIbkrConfig,
    brokerPaperExecutionService,
    brokerConfigService,
    brokerService,
    getIbkrStatus,
    normalizeIbkrMode,
    readUserIbkrConfig,
    runIbkrConnectionTest,
    syncLedgerFromBrokerAccount,
    writeUserIbkrConfig,
  } = deps;

  function readBooleanFlag(value) {
    if (typeof value === "boolean") return value;
    if (value == null) return false;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
  }

  async function persistSecretsIfPresent(userId, provider, body = {}) {
    if (!brokerSecretService || !body?.secrets || typeof body.secrets !== "object") {
      return null;
    }

    await brokerSecretService.upsertBrokerSecret(userId, provider, body.secrets);
    return brokerSecretService.getBrokerSecretStatus(userId, provider);
  }

  async function loadMergedSecrets(userId, provider, body = {}) {
    if (!brokerSecretService) return body;
    const storedSecrets = (await brokerSecretService.getBrokerSecret(userId, provider)) || {};
    return {
      ...body,
      ...storedSecrets,
    };
  }

  async function synchronizeBrokerOrdersIfAvailable(userId, options = {}) {
    if (!brokerPaperExecutionService || !brokerService) return null;
    const provider = await brokerService.getProvider(userId);
    if (provider === "INTERNAL_PAPER") return null;
    return brokerPaperExecutionService.synchronizeOrders(userId, options);
  }

  function normalizeSafeBrokerConfig(input = {}, provider) {
    if (provider !== "MOOMOO") {
      return input || {};
    }

    return {
      host: input.host,
      port: input.port,
      transport: input.transport,
      tradeEnv: input.tradeEnv || input.defaultTrdEnv,
      securityFirm: input.securityFirm,
      market: input.market,
      websocketSsl: input.websocketSsl,
      accountId: input.accountId || input.defaultAccId,
    };
  }

  return {
    async synchronizeBrokerState(req, res) {
      try {
        const provider = await brokerService.getProvider(req.user.id);
        if (provider === "INTERNAL_PAPER") {
          res.json({
            synchronized: false,
            provider,
            reason: "Internal Paper has no external broker state to synchronize.",
          });
          return;
        }

        const synchronization = await synchronizeBrokerOrdersIfAvailable(req.user.id, {
          forceRefresh: true,
          source: req.body?.source || "explicit_broker_sync",
        });

        res.json({
          synchronized: true,
          provider,
          synchronization: synchronization || null,
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async getBrokerConfig(req, res) {
      try {
        const provider =
          req.query?.provider || (await brokerService.getProvider(req.user.id));
        const config = await brokerService.getConfig(req.user.id, provider);
        const secretStatus = brokerSecretService
          ? await brokerSecretService.getBrokerSecretStatus(req.user.id, provider)
          : {
              configured: false,
              provider,
              lastUpdatedAt: null,
            };
        res.json({
          ...config,
          secretStatus: {
            configured: Boolean(secretStatus?.configured),
            lastUpdatedAt: secretStatus?.lastUpdatedAt || null,
            storageReady:
              secretStatus?.storageReady == null ? true : Boolean(secretStatus.storageReady),
          },
        });
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async getBrokerSecretStatus(req, res) {
      try {
        if (!brokerSecretService) {
          res.json({
            configured: false,
            provider: req.query?.provider || (await brokerService.getProvider(req.user.id)),
            lastUpdatedAt: null,
            keyVersion: null,
          });
          return;
        }

        const provider =
          req.query?.provider || (await brokerService.getProvider(req.user.id));
        res.json(
          await brokerSecretService.getBrokerSecretStatus(req.user.id, provider)
        );
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async saveBrokerSecrets(req, res) {
      try {
        if (!brokerSecretService) {
          res.status(501).json({ error: "Broker secret storage is not configured." });
          return;
        }

        const provider =
          req.body?.provider || req.query?.provider || (await brokerService.getProvider(req.user.id));
        const status = await brokerSecretService.upsertBrokerSecret(
          req.user.id,
          provider,
          req.body?.secrets || {}
        );
        res.json(status);
      } catch (error) {
        res.status(400).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async getStatus(req, res) {
      try {
        res.json(getIbkrStatus(await readUserIbkrConfig(req.user.id)));
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async saveConfig(req, res) {
      try {
        const secretStatus = await persistSecretsIfPresent(
          req.user.id,
          "IBKR",
          req.body || {}
        );
        const config = await writeUserIbkrConfig(req.user.id, {
          host: req.body?.host,
          port: req.body?.port,
          clientId: req.body?.clientId ?? req.body?.client_id,
          mode: req.body?.mode,
          last_checked_at: null,
          last_error: null,
          last_connected: false,
          server_time: null,
          account_summary_available: false,
        });

        res.json({
          ...getIbkrStatus(config),
          secretStatus,
        });
      } catch (error) {
        res.status(400).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async saveSelectedBrokerConfig(req, res) {
      try {
        const provider =
          req.body?.provider || req.query?.provider || (await brokerService.getProvider(req.user.id));

        if (!brokerConfigService) {
          res.status(501).json({ error: "Broker config storage is not configured." });
          return;
        }

        const persisted = await brokerConfigService.writeBrokerConfig(req.user.id, {
          provider,
          executionMode: req.body?.executionMode,
          config: normalizeSafeBrokerConfig(req.body?.config || req.body || {}, provider),
        });

        res.json({
          provider: persisted.provider,
          executionMode: persisted.executionMode,
          config: persisted.config,
        });
      } catch (error) {
        res.status(400).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async testConnection(req, res) {
      try {
        const config = buildIbkrConfig(
          req.body || {},
          await readUserIbkrConfig(req.user.id)
        );
        const { result } = brokerService
          ? await brokerService.testConnection(req.user.id, config)
          : { result: await runIbkrConnectionTest(config) };
        const checkedAt = new Date().toISOString();
        const nextConfig = await writeUserIbkrConfig(req.user.id, {
          ...config,
          last_checked_at: checkedAt,
          last_connected: Boolean(result.connected),
          last_error: result.connected ? null : result.error || "IBKR connection failed.",
          server_time: result.server_time || null,
          account_summary_available: Boolean(result.account_summary_available),
        });

        res.json({
          ...getIbkrStatus(nextConfig),
          connection_test: {
            connected: Boolean(result.connected),
            mode: result.mode || config.mode,
            server_time: result.server_time || null,
            account_summary_available: Boolean(result.account_summary_available),
            dependency_available: result.dependency_available ?? null,
            socket_reachable: result.socket_reachable ?? null,
            compatibility_passed: result.compatibility_passed ?? null,
            python_version: result.python_version || null,
            setup_hint: result.setup_hint || null,
            error: result.error || null,
          },
        });
      } catch (error) {
        const checkedAt = new Date().toISOString();

        try {
          await writeUserIbkrConfig(req.user.id, {
            ...buildIbkrConfig(
              req.body || {},
              await readUserIbkrConfig(req.user.id)
            ),
            last_checked_at: checkedAt,
            last_connected: false,
            last_error: String(redactSensitive(error.message)),
          });
        } catch (_writeError) {
          // Keep the response focused on the connection-test failure.
        }

        res.json({
          status: "ERROR",
          host: req.body?.host || "127.0.0.1",
          port: req.body?.port || 7497,
          clientId: req.body?.clientId ?? req.body?.client_id ?? 11,
          mode: normalizeIbkrMode(req.body?.mode),
          error: String(redactSensitive(error.message)),
          details: redactSensitive(error.details),
          last_checked_at: checkedAt,
          connection_test: {
            connected: false,
            mode: normalizeIbkrMode(req.body?.mode),
            server_time: null,
            account_summary_available: false,
            error: String(redactSensitive(error.message)),
          },
        });
      }
    },

    async getBrokerHealth(req, res) {
      try {
        res.json(await brokerService.getHealth(req.user.id));
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async testSelectedBrokerConnection(req, res) {
      try {
        const provider =
          req.body?.provider || (await brokerService.getProvider(req.user.id));
        const secretStatus = await persistSecretsIfPresent(
          req.user.id,
          provider,
          req.body || {}
        );
        res.json({
          ...(await brokerService.testConnection(
            req.user.id,
            await loadMergedSecrets(req.user.id, provider, {
              ...normalizeSafeBrokerConfig(req.body?.config || req.body || {}, provider),
              provider,
            }),
            provider
          )),
          secretStatus,
        });
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
          details: redactSensitive(error.details || null),
        });
      }
    },

    async getBrokerAccount(req, res) {
      try {
        res.json(
          await brokerService.getAccountSummary(req.user.id, {
            forceRefresh: readBooleanFlag(req.query?.refresh),
          })
        );
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async getBrokerAccounts(req, res) {
      try {
        const provider =
          req.query?.provider || (await brokerService.getProvider(req.user.id));
        res.json(await brokerService.getAccounts(req.user.id, provider));
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async getBrokerCapabilities(req, res) {
      try {
        res.json(await brokerService.getCapabilities(req.user.id));
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async getBrokerReconciliation(req, res) {
      try {
        res.json(
          await brokerService.getReconciliation(req.user.id, null, {
            forceRefresh: readBooleanFlag(req.query?.refresh),
          })
        );
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async syncBrokerLedger(req, res) {
      try {
        if (!syncLedgerFromBrokerAccount) {
          res.status(501).json({ error: "Broker ledger sync is not configured." });
          return;
        }

        const provider = await brokerService.getProvider(req.user.id);
        if (provider === "INTERNAL_PAPER") {
          res.status(409).json({
            error:
              "Internal Paper is already the primary ledger source. No broker sync is available.",
          });
          return;
        }

        const brokerAccount = await brokerService.getAccountSummary(req.user.id);
        const syncResult = await syncLedgerFromBrokerAccount(
          req.user.id,
          brokerAccount
        );
        const [updatedReconciliation, updatedPreflight] = await Promise.all([
          brokerService.getReconciliation(req.user.id),
          brokerService.getPreflight(req.user.id),
        ]);

        res.json({
          provider,
          account: {
            cash: brokerAccount.cash,
            equity: brokerAccount.equity,
            positions: brokerAccount.positions?.length || 0,
          },
          syncSummary: syncResult.syncSummary,
          reconciliation: updatedReconciliation,
          preflight: updatedPreflight,
        });
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async getBrokerLogs(req, res) {
      try {
        res.json({ logs: await brokerService.getLogs(req.user.id, req.query?.limit) });
      } catch (error) {
        res.status(500).json({ error: String(redactSensitive(error.message)) });
      }
    },

    async getBrokerPreflight(req, res) {
      try {
        res.json(
          await brokerService.getPreflight(req.user.id, {
            forceRefresh: readBooleanFlag(req.query?.refresh),
          })
        );
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async listBrokerOrders(req, res) {
      try {
        res.json({
          orders: await brokerPaperExecutionService.listOrders(req.user.id, {
            status: req.query?.status,
            limit: req.query?.limit ? Number(req.query.limit) : undefined,
          }),
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async listBrokerFills(req, res) {
      try {
        res.json({
          fills: await brokerPaperExecutionService.listFills(req.user.id, {
            limit: req.query?.limit ? Number(req.query.limit) : undefined,
          }),
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async previewPaperOrder(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.previewApproval(
            req.user.id,
            req.body?.approvalId || req.body?.approval_id
          )
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
          approval_request: error.approvalRequest || null,
          pre_trade_analysis: error.preTradeAnalysis || null,
        });
      }
    },

    async executePaperOrder(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.executeApproval(
            req.user.id,
            req.body?.approvalId || req.body?.approval_id,
            {
              confirmSubmit: Boolean(req.body?.confirmSubmit),
              decisionNote: req.body?.decisionNote || req.body?.decision_note || null,
            }
          )
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
          approval_request: error.approvalRequest || null,
          pre_trade_analysis: error.preTradeAnalysis || null,
          broker_order: error.brokerOrder || null,
          preflight: error.preflight || null,
        });
      }
    },

    async syncBrokerOrder(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.syncOrder(req.user.id, req.params.id)
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async markBrokerOrderCancelled(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.markOrderCancelled(
            req.user.id,
            req.params.id,
            {
              source: "broker_reconciliation_manual_cancel",
              reason:
                req.body?.reason ||
                "Marked cancelled from reconciliation because it no longer appears in broker open orders.",
            }
          )
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async importBrokerOrder(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.importExternalOrder(req.user.id, {
            brokerOrderId:
              req.body?.brokerOrderId ||
              req.body?.orderId ||
              req.params.id ||
              null,
            symbol: req.body?.symbol || null,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async cancelBrokerOrder(req, res) {
      try {
        res.json(
          await brokerPaperExecutionService.cancelOrder(req.user.id, req.params.id)
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async placeBrokerOrder(req, res) {
      try {
        res.json(await brokerService.placePaperOrder(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 403).json({
          error: String(redactSensitive(error.message)),
          preflight: error.preflight || null,
          details: error.details || null,
        });
      }
    },

    async previewManualBrokerOrder(req, res) {
      try {
        res.json(await brokerService.previewManualOrder(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async cancelWorkspaceOrder(req, res) {
      try {
        res.json(
          await brokerService.cancelOrder(
            req.user.id,
            req.body?.brokerOrderId || req.body?.orderId || req.params.id,
            req.body || {}
          )
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async modifyWorkspaceOrder(req, res) {
      try {
        res.json(await brokerService.modifyOrder(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async getWorkspaceOrderStatus(req, res) {
      try {
        res.json(await brokerService.getOrderStatus(req.user.id, req.query || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },

    async getWorkspaceExecutions(req, res) {
      try {
        res.json(await brokerService.getExecutions(req.user.id, req.query || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: String(redactSensitive(error.message)),
        });
      }
    },
  };
}

module.exports = { createBrokerController };
