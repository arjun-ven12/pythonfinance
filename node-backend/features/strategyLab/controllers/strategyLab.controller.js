function createStrategyLabController({
  buildExperimentBacktestConfig,
  buildStrategyComparisonMetrics,
  buildStrategyComparisonWinner,
  buildStrategyExperimentCreateData,
  buildStrategyExperimentUpdateData,
  buildStrategyRunData,
  computeDeploymentReadiness,
  activateStrategyVersion,
  assignStrategyToActiveSet,
  createStrategyVersion,
  deactivateStrategyDeployment,
  getActiveSetState,
  getStrategyValidationAggregate,
  getStrategyLifecycleDashboard,
  getStrategyLifecycleEvidence,
  getStrategyExperimentId,
  getStrategyLeaderboard,
  getStrategyMemory,
  getDeploymentAllocationDashboard,
  computeLifecycleReadiness,
  removeStrategyFromActiveSet,
  resolveCanonicalDeploymentState,
  statusFromReadiness,
  persistStrategyRunTrades,
  persistMarketRegimeSnapshots,
  prisma,
  readActiveStrategyConfig,
  resolveBacktestUniversePayload,
  runBacktestLabConfigForSymbols,
  runBacktestParameterSweep: runStandaloneBacktestParameterSweep,
  runMonteCarloStress,
  runParameterSweep,
  runRegimeAnalysis,
  runStrategyRobustness,
  runStrategyPreview,
  runMatrixReplay,
  runWalkForward,
  sanitizeBacktestConfig,
  simulateStrategyPortfolio: runStrategyPortfolioSimulation,
    strategyStorage,
    updateDeploymentAllocation,
    writeActiveStrategyConfig,
  }) {
  const hydrateExperiment = (experiment) =>
    strategyStorage?.hydrateStrategyExperimentRecord
      ? strategyStorage.hydrateStrategyExperimentRecord(experiment)
      : experiment;
  const hydrateExperiments = (experiments = []) => experiments.map(hydrateExperiment);

  return {
    async listExperiments(req, res) {
      try {
        const experiments = await prisma.run((db) =>
          db.strategyExperiment.findMany({
            where: { userId: req.user.id },
            orderBy: {
              updatedAt: "desc",
            },
            include: {
              runs: {
                orderBy: {
                  createdAt: "desc",
                },
                take: 20,
                include: {
                  trades: {
                    orderBy: {
                      exitDate: "desc",
                    },
                  },
                },
              },
              _count: {
                select: {
                  runs: true,
                  parameterSweeps: true,
                  leftComparisons: true,
                  rightComparisons: true,
                },
              },
              parameterSweeps: {
                orderBy: {
                  createdAt: "desc",
                },
                take: 5,
                include: {
                  results: {
                    orderBy: {
                      rank: "asc",
                    },
                    take: 20,
                  },
                },
              },
              versions: {
                orderBy: {
                  version: "desc",
                },
                take: 10,
              },
              walkForwardRuns: {
                orderBy: {
                  createdAt: "desc",
                },
                take: 3,
                include: {
                  segments: {
                    orderBy: {
                      segmentIndex: "asc",
                    },
                  },
                  metrics: true,
                },
              },
              stressResults: {
                orderBy: {
                  createdAt: "desc",
                },
                take: 3,
              },
            },
          })
        );

        res.json({ experiments: hydrateExperiments(experiments) });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getActiveStrategy(req, res) {
      try {
        const [activeStrategy, activeSet, deployment] = await Promise.all([
          readActiveStrategyConfig(req.user.id),
          getActiveSetState({
            prisma,
            userId: req.user.id,
            readActiveStrategyConfig,
          }),
          resolveCanonicalDeploymentState({
            prisma,
            userId: req.user.id,
            readActiveStrategyConfig,
          }),
        ]);
        res.json({
          ...activeStrategy,
          deployment,
          activeSet,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async setActiveStrategy(req, res) {
      try {
        const experimentId = req.body?.experimentId || req.body?.id;
        const requestedVersionId = req.body?.strategyVersionId || req.body?.versionId || null;

        if (!experimentId) {
          const activeStrategy = await deactivateStrategyDeployment({
            prisma,
            userId: req.user.id,
            readActiveStrategyConfig,
            writeActiveStrategyConfig,
            reasonNote: "Manual deactivation from Strategy Lab",
          });
          const [activeSet, deployment] = await Promise.all([
            getActiveSetState({
              prisma,
              userId: req.user.id,
              readActiveStrategyConfig,
            }),
            resolveCanonicalDeploymentState({
              prisma,
              userId: req.user.id,
              readActiveStrategyConfig,
            }),
          ]);
          res.json({
            ...activeStrategy,
            deployment,
            activeSet,
          });
          return;
        }

        const experimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: String(experimentId),
              userId: req.user.id,
            },
            include: {
              versions: {
                orderBy: {
                  version: "desc",
                },
                take: 25,
              },
            },
          })
        );
        const experiment = hydrateExperiment(experimentRecord);

        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const evidence = await getStrategyLifecycleEvidence(
          prisma,
          req.user.id,
          experiment,
          { targetVersionId: requestedVersionId }
        );
        const targetVersion =
          (requestedVersionId &&
            experiment.versions?.find((version) => version.id === requestedVersionId)) ||
          evidence.targetVersion ||
          evidence.latestVersion;
        if (requestedVersionId && !targetVersion) {
          res.status(404).json({ error: "Requested strategy version not found." });
          return;
        }
        const validation = await getStrategyValidationAggregate(prisma, req.user.id, {
          strategyVersionId: targetVersion?.id,
          strategyId: experiment.id,
        });
        const readiness = computeLifecycleReadiness({
          computeDeploymentReadiness,
          latestRun: evidence.latestRun,
          robustness: experiment.settingsJson?.robustness,
          latestWalkForward: evidence.latestWalkForward,
          validation,
          validationWarnings: experiment.settingsJson?.dslValidation?.warnings || [],
          activationRules: evidence.activationRules,
        });

        if (!readiness.canActivate) {
          res.status(400).json({
            error: "Strategy is not ready for activation.",
            readiness,
          });
          return;
        }

        const activeVersion = targetVersion;
        if (!activeVersion) {
          res.status(409).json({
            error: "Strategy has no saved version to activate.",
            readiness,
          });
          return;
        }

        const activeStrategy = await activateStrategyVersion({
          prisma,
          userId: req.user.id,
          experiment,
          version: activeVersion,
          readiness,
          writeActiveStrategyConfig,
        });

        const activeSet = await getActiveSetState({
          prisma,
          userId: req.user.id,
          readActiveStrategyConfig,
        });
        const deployment = await resolveCanonicalDeploymentState({
          prisma,
          userId: req.user.id,
          readActiveStrategyConfig,
        });

        res.json({
          ...activeStrategy,
          deployment,
          activeSet,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getStrategyActiveSet(req, res) {
      try {
        res.json(
          await getActiveSetState({
            prisma,
            userId: req.user.id,
            readActiveStrategyConfig,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async assignStrategyActiveSet(req, res) {
      try {
        const experimentId = req.body?.experimentId || req.body?.id;
        if (!experimentId) {
          res.status(400).json({ error: "experimentId is required." });
          return;
        }

        res.json(
          await assignStrategyToActiveSet({
            prisma,
            userId: req.user.id,
            targetExperimentId: String(experimentId),
            contexts: Array.isArray(req.body?.contexts) ? req.body.contexts : [],
            readActiveStrategyConfig,
            writeActiveStrategyConfig,
            createStrategyVersion,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
      }
    },

    async removeStrategyActiveSet(req, res) {
      try {
        res.json(
          await removeStrategyFromActiveSet({
            prisma,
            userId: req.user.id,
            targetExperimentId: req.body?.experimentId || req.body?.id || null,
            contexts: Array.isArray(req.body?.contexts) ? req.body.contexts : [],
            readActiveStrategyConfig,
            writeActiveStrategyConfig,
            createStrategyVersion,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
      }
    },

    async createExperiment(req, res) {
      try {
        const experiment = await prisma.run(async (db) => {
          const createData = buildStrategyExperimentCreateData(req.body || {});
          const encryptedData = strategyStorage.encryptExperimentForStorage({
            ...createData,
            id: createData.id || undefined,
            userId: req.user.id,
          });
          const created = await db.strategyExperiment.create({
            data: {
              ...encryptedData,
              userId: req.user.id,
            },
          });
          await createStrategyVersion(db, req.user.id, created, "Initial strategy version");
          return hydrateExperiment(created);
        });

        res.status(201).json(experiment);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async updateExperiment(req, res) {
      try {
        const existingExperimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );
        const existingExperiment = hydrateExperiment(existingExperimentRecord);

        if (!existingExperiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const updateData = buildStrategyExperimentUpdateData(
          req.body || {},
          existingExperiment
        );

        if (
          updateData.settingsJson !== undefined &&
          existingExperiment.status === "ACTIVE" &&
          updateData.status === undefined
        ) {
          updateData.status = "CANDIDATE";
        }

        if (Object.keys(updateData).length === 0) {
          res.json(existingExperiment);
          return;
        }

        const experiment = await prisma.run(async (db) => {
          const encryptedData = strategyStorage.encryptExperimentForStorage({
            id: existingExperiment.id,
            userId: req.user.id,
            name: updateData.name ?? existingExperiment.name,
            description:
              updateData.description !== undefined
                ? updateData.description
                : existingExperiment.description,
            status: updateData.status ?? existingExperiment.status,
            settingsJson: updateData.settingsJson ?? existingExperiment.settingsJson,
          });
          const updated = await db.strategyExperiment.updateMany({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
            data: {
              ...(updateData.name !== undefined ? { name: encryptedData.name } : {}),
              ...(updateData.description !== undefined
                ? { description: encryptedData.description }
                : {}),
              ...(updateData.status !== undefined ? { status: encryptedData.status } : {}),
              ...(updateData.settingsJson !== undefined
                ? {
                    settingsJson: encryptedData.settingsJson,
                    encryptedStrategy: encryptedData.encryptedStrategy,
                    encryptedStrategyKey: encryptedData.encryptedStrategyKey,
                    strategyEncryptionIv: encryptedData.strategyEncryptionIv,
                    strategyEncryptionTag: encryptedData.strategyEncryptionTag,
                    strategyEncryptionKeyIv: encryptedData.strategyEncryptionKeyIv,
                    strategyEncryptionKeyTag: encryptedData.strategyEncryptionKeyTag,
                    strategyEncryptionAlgorithmVersion:
                      encryptedData.strategyEncryptionAlgorithmVersion,
                  }
                : {}),
            },
          });
          if (updated.count !== 1) {
            return null;
          }
          const nextExperimentRecord = await db.strategyExperiment.findFirst({
            where: { id: req.params.id, userId: req.user.id },
          });
          const nextExperiment = hydrateExperiment(nextExperimentRecord);
          if (nextExperiment) {
            await createStrategyVersion(db, req.user.id, nextExperiment, "Saved strategy changes");
          }
          return nextExperiment;
        });

        res.json(experiment);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async deleteExperiment(req, res) {
      try {
        const existingExperiment = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );

        if (!existingExperiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const activeDeployment = await resolveCanonicalDeploymentState({
          prisma,
          userId: req.user.id,
          readActiveStrategyConfig,
        });
        if (activeDeployment.owner?.experimentId === req.params.id) {
          res.status(409).json({
            error: "Active deployed strategies cannot be deleted. Deactivate or roll back first.",
            deployment: activeDeployment,
          });
          return;
        }

        await prisma.run((db) =>
          db.strategyExperiment.deleteMany({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );

        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async previewStrategy(req, res) {
      try {
        res.json(await runStrategyPreview(req.body || {}));
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runExperiment(req, res) {
      try {
        const experimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );
        const experiment = hydrateExperiment(experimentRecord);

        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const requestBody = req.body || {};
        const shouldUseSavedUniverse =
          !requestBody.symbol &&
          !requestBody.symbols &&
          !requestBody.symbolList &&
          !requestBody.universeId &&
          experiment.settingsJson?.universeId;
        const resolvedBody = await resolveBacktestUniversePayload(req.user.id, {
          ...requestBody,
          ...(shouldUseSavedUniverse
            ? { universeId: experiment.settingsJson.universeId }
            : {}),
        });
        const config = buildExperimentBacktestConfig(experiment, resolvedBody);
        const backtestOutput = await runBacktestLabConfigForSymbols(config);
        const run = await prisma.run((db) =>
          db.strategyRun.create({
            data: {
              ...buildStrategyRunData(experiment.id, backtestOutput),
              userId: req.user.id,
            },
          })
        );
        await persistStrategyRunTrades(run.id, backtestOutput);
        await persistMarketRegimeSnapshots(req.user.id, config.symbol, backtestOutput);

        res.status(201).json({
          experiment,
          run: await prisma.run((db) => db.strategyRun.findUnique({
            where: { id: run.id, userId: req.user.id },
            include: { trades: true },
          })),
          backtest: backtestOutput.result,
        });
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runExperimentSweep(req, res) {
      try {
        const experimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );
        const experiment = hydrateExperiment(experimentRecord);

        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const requestBody = req.body || {};
        const shouldUseSavedUniverse =
          !requestBody.symbol &&
          !requestBody.symbols &&
          !requestBody.symbolList &&
          !requestBody.universeId &&
          experiment.settingsJson?.universeId;
        const sweepOutput = await runParameterSweep(
          experiment,
          await resolveBacktestUniversePayload(req.user.id, {
            ...requestBody,
            ...(shouldUseSavedUniverse
              ? { universeId: experiment.settingsJson.universeId }
              : {}),
          })
        );
        const sweep = await prisma.run(async (db) => {
          const createdSweep = await db.strategyParameterSweep.create({
            data: {
              userId: req.user.id,
              experimentId: experiment.id,
              symbol: sweepOutput.config.symbol,
              period: sweepOutput.config.period,
              rangesJson: {
                ranges: sweepOutput.config.ranges,
                values: sweepOutput.config.values,
                symbols: sweepOutput.config.symbols,
                total_backtests: sweepOutput.config.totalBacktests,
                max_combinations: sweepOutput.config.maxCombinations,
              },
              rankingJson: {
                ranked_by: ["sharpe", "return", "drawdown"],
                top_20: sweepOutput.topResults.map((result, index) => ({
                  rank: index + 1,
                  emaFast: result.emaFast,
                  emaSlow: result.emaSlow,
                  rsiThreshold: result.rsiThreshold,
                  sharpe: result.sharpe,
                  returnPct: result.returnPct,
                  maxDrawdown: result.maxDrawdown,
                })),
              },
              totalRuns: sweepOutput.results.length,
            },
          });

          if (sweepOutput.results.length > 0) {
            await db.strategyParameterSweepResult.createMany({
              data: sweepOutput.results.map((result, index) => ({
                ...result,
                sweepId: createdSweep.id,
                rank: index + 1,
              })),
            });
          }

          return db.strategyParameterSweep.findFirst({
            where: {
              id: createdSweep.id,
              userId: req.user.id,
            },
            include: {
              results: {
                orderBy: {
                  rank: "asc",
                },
                take: 20,
              },
            },
          });
        });

        res.status(201).json({
          sweep,
          top_results: sweep?.results || [],
        });
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runRobustness(req, res) {
      try {
        const experimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );
        const experiment = hydrateExperiment(experimentRecord);

        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const config = buildExperimentBacktestConfig(experiment, req.body || {});
        const robustness = await runStrategyRobustness({
          experiment,
          baseConfig: config,
          runBacktest: runBacktestLabConfigForSymbols,
        });
          const updatedSettings = {
            ...(experiment.settingsJson || {}),
            robustness,
            deploymentReadiness: robustness.deploymentReadiness,
          };
          const updated = await prisma.run(async (db) => {
            const encryptedData = strategyStorage.encryptExperimentForStorage({
              id: experiment.id,
              userId: req.user.id,
              name: experiment.name,
              description: experiment.description,
              status: statusFromReadiness(robustness.deploymentReadiness),
              settingsJson: updatedSettings,
            });
            await db.strategyExperiment.updateMany({
              where: { id: experiment.id, userId: req.user.id },
              data: {
                settingsJson: encryptedData.settingsJson,
                encryptedStrategy: encryptedData.encryptedStrategy,
                encryptedStrategyKey: encryptedData.encryptedStrategyKey,
                strategyEncryptionIv: encryptedData.strategyEncryptionIv,
                strategyEncryptionTag: encryptedData.strategyEncryptionTag,
                strategyEncryptionKeyIv: encryptedData.strategyEncryptionKeyIv,
                strategyEncryptionKeyTag: encryptedData.strategyEncryptionKeyTag,
                strategyEncryptionAlgorithmVersion:
                  encryptedData.strategyEncryptionAlgorithmVersion,
                status: encryptedData.status,
              },
            });
          const nextExperimentRecord = await db.strategyExperiment.findFirst({
            where: { id: experiment.id, userId: req.user.id },
          });
          const nextExperiment = hydrateExperiment(nextExperimentRecord);
          await createStrategyVersion(db, req.user.id, nextExperiment, "Robustness test");
          return nextExperiment;
        });

        res.json({ robustness, experiment: updated });
      } catch (error) {
        res.status(400).json({ error: error.message, details: error.details });
      }
    },

    async runWalkForward(req, res) {
      try {
        const experimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: req.params.id,
              userId: req.user.id,
            },
          })
        );
        const experiment = hydrateExperiment(experimentRecord);

        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const result = await runWalkForward({
          userId: req.user.id,
          experiment,
          body: await resolveBacktestUniversePayload(req.user.id, req.body || {}),
        });

        res.status(201).json(result);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runRegimeAnalysis(req, res) {
      try {
        res.json(await runRegimeAnalysis({
          userId: req.user.id,
          experimentId: req.params.id,
        }));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runStressTest(req, res) {
      try {
        res.status(201).json(await runMonteCarloStress({
          userId: req.user.id,
          experimentId: req.params.id,
          body: req.body || {},
        }));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getStrategyLeaderboard(req, res) {
      try {
        res.json(await getStrategyLeaderboard(req.user.id));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getStrategyMemory(req, res) {
      try {
        res.json(await getStrategyMemory({
          userId: req.user.id,
          experimentId: req.params.id,
        }));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async getStrategyLifecycleDashboard(req, res) {
      try {
        res.json(await getStrategyLifecycleDashboard({
          prisma,
          userId: req.user.id,
          experimentId: req.query?.experimentId || null,
        }));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async simulateStrategyPortfolio(req, res) {
      try {
        res.json(await runStrategyPortfolioSimulation({
          userId: req.user.id,
          body: req.body || {},
        }));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runMatrixReplay(req, res) {
      try {
        const resolvedBody = await resolveBacktestUniversePayload(req.user.id, req.body || {});
        res.json(await runMatrixReplay({
          userId: req.user.id,
          body: resolvedBody,
        }));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getDeploymentAllocationDashboard(req, res) {
      try {
        res.json(
          await getDeploymentAllocationDashboard({
            userId: req.user.id,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async updateDeploymentAllocation(req, res) {
      try {
        res.json(
          await updateDeploymentAllocation({
            actorUserId: req.user.id,
            body: req.body || {},
            userId: req.user.id,
          })
        );
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async compareStrategies(req, res) {
      try {
        const leftExperimentId = getStrategyExperimentId(req.body || {}, [
          "leftExperimentId",
          "left_experiment_id",
          "leftId",
        ]);
        const rightExperimentId = getStrategyExperimentId(req.body || {}, [
          "rightExperimentId",
          "right_experiment_id",
          "rightId",
        ]);

        if (!leftExperimentId || !rightExperimentId) {
          res.status(400).json({
            error: "leftExperimentId and rightExperimentId are required.",
          });
          return;
        }

        if (leftExperimentId === rightExperimentId) {
          res.status(400).json({
            error: "Choose two different strategy experiments to compare.",
          });
          return;
        }

        const [leftExperimentRecord, rightExperimentRecord] = await prisma.run((db) =>
          Promise.all([
            db.strategyExperiment.findFirst({
              where: {
                id: leftExperimentId,
                userId: req.user.id,
              },
              include: {
                runs: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  include: {
                    trades: true,
                  },
                },
              },
            }),
            db.strategyExperiment.findFirst({
              where: {
                id: rightExperimentId,
                userId: req.user.id,
              },
              include: {
                runs: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  include: {
                    trades: true,
                  },
                },
              },
            }),
          ])
        );
        const leftExperiment = hydrateExperiment(leftExperimentRecord);
        const rightExperiment = hydrateExperiment(rightExperimentRecord);

        if (!leftExperiment || !rightExperiment) {
          res.status(404).json({
            error: "One or both strategy experiments were not found.",
          });
          return;
        }

        const leftRun = leftExperiment.runs[0];
        const rightRun = rightExperiment.runs[0];

        if (!leftRun || !rightRun) {
          res.status(409).json({
            error: "Both strategy experiments need at least one run before comparison.",
            missingRuns: {
              left: !leftRun,
              right: !rightRun,
            },
          });
          return;
        }

        const metrics = buildStrategyComparisonMetrics(leftRun, rightRun);
        const winnerResult = buildStrategyComparisonWinner(
          leftExperiment,
          rightExperiment,
          leftRun,
          rightRun
        );
        const comparisonJson = {
          winner: winnerResult.winner,
          winnerName: winnerResult.winnerName || null,
          reason: winnerResult.reason,
          metrics,
          left: {
            experimentId: leftExperiment.id,
            name: leftExperiment.name,
            runId: leftRun.id,
            returnPct: leftRun.returnPct,
            sharpe: leftRun.sharpe,
            maxDrawdown: leftRun.maxDrawdown,
            winRate: leftRun.winRate,
            expectancy: leftRun.expectancy,
          },
          right: {
            experimentId: rightExperiment.id,
            name: rightExperiment.name,
            runId: rightRun.id,
            returnPct: rightRun.returnPct,
            sharpe: rightRun.sharpe,
            maxDrawdown: rightRun.maxDrawdown,
            winRate: rightRun.winRate,
            expectancy: rightRun.expectancy,
          },
          scoreDifference: winnerResult.scoreDifference,
        };
        const comparison = await prisma.run((db) =>
          db.strategyComparison.create({
            data: {
              userId: req.user.id,
              leftExperimentId,
              rightExperimentId,
              comparisonJson,
            },
          })
        );

        res.status(201).json({
          winner: winnerResult.winner,
          reason: winnerResult.reason,
          metrics,
          comparison,
        });
      } catch (error) {
        res.status(500).json({
          error: error.message,
        });
      }
    },

    async runBacktestParameterSweep(req, res) {
      try {
        res.json(await runStandaloneBacktestParameterSweep(req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async runBacktest(req, res) {
      try {
        const compareMode = Boolean(req.body?.compareMode);
        const strategyA = sanitizeBacktestConfig(
          await resolveBacktestUniversePayload(
            req.user.id,
            req.body?.strategyA || req.body || {}
          )
        );
        const runs = [await runBacktestLabConfigForSymbols(strategyA)];

        if (compareMode) {
          const strategyB = sanitizeBacktestConfig({
            ...strategyA,
            ...(await resolveBacktestUniversePayload(
              req.user.id,
              req.body?.strategyB || {}
            )),
          });
          runs.push(await runBacktestLabConfigForSymbols(strategyB));
        }

        res.json({
          generated_at: new Date().toISOString(),
          compare_mode: compareMode,
          runs,
        });
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },
  };
}

module.exports = createStrategyLabController;
