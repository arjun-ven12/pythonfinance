function createStrategyLabController({
  buildExperimentBacktestConfig,
  buildStrategyComparisonMetrics,
  buildStrategyComparisonWinner,
  buildStrategyExperimentCreateData,
  buildStrategyExperimentUpdateData,
  buildStrategyRunData,
  compareStrategiesCopilot,
  computeDeploymentReadiness,
  activateStrategyVersion,
  answerStrategyQuestion,
  answerResearchQuestion,
  assignStrategyToActiveSet,
  compareStrategyVersions,
  createStrategyVersion,
  deactivateStrategyDeployment,
  explainStrategy,
  generateResearchReport,
  getActiveSetState,
  getStrategyValidationAggregate,
  getStrategyLifecycleDashboard,
  getStrategyLifecycleEvidence,
  getStrategyExperimentId,
  getStrategyLeaderboard,
  getStrategyMemory,
  getDeploymentAllocationDashboard,
  generateStrategyDraft,
  computeLifecycleReadiness,
  proposeStrategyEdit,
  removeStrategyFromActiveSet,
  resolveCanonicalDeploymentState,
  reviewStrategy,
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
  matrixCopilotService,
  matrixAdvisorService,
  matrixProposalService,
  memoryIngestionService,
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
  const findStrategyForCopilot = async (userId, experimentId) => {
    const experimentRecord = await prisma.run((db) =>
      db.strategyExperiment.findFirst({
        where: {
          id: String(experimentId),
          userId,
        },
        include: {
          runs: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
          versions: {
            orderBy: { version: "desc" },
            take: 10,
          },
        },
      })
    );
    return hydrateExperiment(experimentRecord);
  };

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
          const previous = await prisma.run((db) => db.strategyVersion.findFirst({ where: { userId: req.user.id, deploymentStatus: "ACTIVE" }, include: { experiment: { select: { name: true } } }, orderBy: { activatedAt: "desc" } }));
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
          if (previous && memoryIngestionService) { const { strategyDeactivatedEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromStrategy(strategyDeactivatedEvent({ ...previous, strategyName: previous.experiment?.name })); }
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
        const previousActiveVersion = experiment.versions?.find((version) => version.deploymentStatus === "ACTIVE") || null;
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
          if (targetVersion && memoryIngestionService) {
            const { strategyValidationEvent } = require("../../memory/services/memoryEvents");
            await memoryIngestionService.recordFromStrategy(strategyValidationEvent(
              { ...targetVersion, userId: req.user.id },
              false,
              { strategyName: experiment.name, deploymentBlocked: true, failureCodes: readiness.reasons || readiness.blockers || [], readinessScore: readiness.score }
            ));
          }
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
        if (memoryIngestionService) {
          const { strategyRollbackEvent, strategyValidationEvent, strategyVersionEvent } = require("../../memory/services/memoryEvents");
          await memoryIngestionService.recordFromStrategy(strategyValidationEvent({ ...activeVersion, userId: req.user.id }, true, { strategyName: experiment.name, readinessScore: readiness.score }));
          await memoryIngestionService.recordFromStrategy(strategyVersionEvent({ ...activeVersion, userId: req.user.id, deploymentStatus: "ACTIVE", activatedAt: new Date() }, experiment.name));
          if (previousActiveVersion && previousActiveVersion.id !== activeVersion.id && previousActiveVersion.version > activeVersion.version) {
            await memoryIngestionService.recordFromStrategy(strategyRollbackEvent(
              { ...activeVersion, userId: req.user.id },
              previousActiveVersion,
              { strategyName: experiment.name, reason: req.body?.reason || "User selected an earlier validated version" }
            ));
          }
        }

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

        if (memoryIngestionService) {
          const { strategyCreatedEvent, strategyVersionEvent } = require("../../memory/services/memoryEvents");
          await memoryIngestionService.recordFromStrategy(strategyCreatedEvent(experiment));
          const version = await prisma.run((db) => db.strategyVersion.findFirst({ where: { userId: req.user.id, experimentId: experiment.id }, orderBy: { version: "desc" } }));
          if (version) await memoryIngestionService.recordFromStrategy(strategyVersionEvent(version, experiment.name));
        }

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

    async generateStrategyDraft(req, res) {
      try {
        res.json(await generateStrategyDraft(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async explainStrategy(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        if (!experimentId) {
          res.status(400).json({ error: "experimentId is required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        res.json(await explainStrategy(req.user.id, experiment));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async reviewStrategy(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        if (!experimentId) {
          res.status(400).json({ error: "experimentId is required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        res.json(await reviewStrategy(req.user.id, experiment));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async askStrategyQuestion(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        const question = String(req.body?.question || "").trim();
        if (!experimentId || !question) {
          res.status(400).json({ error: "experimentId and question are required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        res.json(await answerStrategyQuestion(req.user.id, experiment, question));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async proposeStrategyEdit(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        const prompt = String(req.body?.prompt || "").trim();
        if (!experimentId || !prompt) {
          res.status(400).json({ error: "experimentId and prompt are required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const proposal = await proposeStrategyEdit(req.user.id, experiment, prompt);
        if (memoryIngestionService && proposal?.status === "READY") {
          const { hash } = require("../../memory/services/memoryPolicy");
          const { strategyEditDecisionEvent } = require("../../memory/services/memoryEvents");
          await memoryIngestionService.recordFromStrategy(strategyEditDecisionEvent(
            { ...experiment, userId: req.user.id },
            "STRATEGY_EDIT_PROPOSED",
            {
              summary: proposal.review?.summary || proposal.review?.recommendation || "AI-assisted strategy edit",
              reason: prompt,
              contractHash: hash(proposal.draft?.after?.settings?.strategyJson || proposal.draft?.after?.settings || {}),
              parentVersionId: experiment.versions?.[0]?.id || null,
              diffSummary: proposal.diff?.summary || null,
            }
          ));
        }
        res.json(proposal);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async approveStrategyEdit(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        if (!experimentId) {
          res.status(400).json({ error: "experimentId is required." });
          return;
        }

        const existingExperimentRecord = await prisma.run((db) =>
          db.strategyExperiment.findFirst({
            where: {
              id: experimentId,
              userId: req.user.id,
            },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 5,
              },
            },
          })
        );
        const existingExperiment = hydrateExperiment(existingExperimentRecord);

        if (!existingExperiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const proposedForm = req.body?.proposedForm || req.body?.draft?.after;
        if (!proposedForm?.settings) {
          res.status(400).json({ error: "proposedForm.settings is required." });
          return;
        }

        const updateData = buildStrategyExperimentUpdateData(
          {
            name: proposedForm.name ?? existingExperiment.name,
            description: proposedForm.description ?? existingExperiment.description,
            status: proposedForm.status ?? existingExperiment.status,
            settings: proposedForm.settings,
          },
          existingExperiment
        );
        const reason = String(req.body?.reason || req.body?.review?.reason || "AI strategy edit").trim();
        const summary = String(req.body?.summary || req.body?.review?.summaryOfChanges || "Approved AI strategy edit").trim();
        const changeNote = `${reason}: ${summary}`.slice(0, 240);
        const { hash: hashMemoryContent } = require("../../memory/services/memoryPolicy");
        const contractHash = hashMemoryContent(proposedForm.settings?.strategyJson || proposedForm.settings);

        const result = await prisma.run(async (db) => {
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
              id: existingExperiment.id,
              userId: req.user.id,
            },
            data: {
              name: encryptedData.name,
              description: encryptedData.description,
              status: encryptedData.status,
              settingsJson: encryptedData.settingsJson,
              encryptedStrategy: encryptedData.encryptedStrategy,
              encryptedStrategyKey: encryptedData.encryptedStrategyKey,
              strategyEncryptionIv: encryptedData.strategyEncryptionIv,
              strategyEncryptionTag: encryptedData.strategyEncryptionTag,
              strategyEncryptionKeyIv: encryptedData.strategyEncryptionKeyIv,
              strategyEncryptionKeyTag: encryptedData.strategyEncryptionKeyTag,
              strategyEncryptionAlgorithmVersion:
                encryptedData.strategyEncryptionAlgorithmVersion,
            },
          });

          if (updated.count !== 1) {
            return null;
          }

          const nextExperimentRecord = await db.strategyExperiment.findFirst({
            where: { id: existingExperiment.id, userId: req.user.id },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 10,
              },
            },
          });
          const nextExperiment = hydrateExperiment(nextExperimentRecord);
          const latestVersion = existingExperiment.versions?.[0] || null;
          const version = await createStrategyVersion(
            db,
            req.user.id,
            nextExperiment,
            changeNote,
            {
              evidenceJson: {
                aiEdit: {
                  generated: true,
                  approvedByUserId: req.user.id,
                  reason,
                  summary,
                  contractHash,
                  parentVersionId: latestVersion?.id || null,
                  parentVersion: latestVersion?.version || null,
                },
              },
            }
          );

          return {
            experiment: nextExperiment,
            version,
          };
        });

        if (result?.version && memoryIngestionService) {
          const { strategyEditDecisionEvent, strategyVersionEvent } = require("../../memory/services/memoryEvents");
          await memoryIngestionService.recordFromStrategy(strategyEditDecisionEvent(
            result.version,
            "STRATEGY_EDIT_APPROVED",
            {
              strategyName: result.experiment?.name,
              reason,
              summary,
              contractHash,
              parentVersionId: result.version.evidenceJson?.aiEdit?.parentVersionId || existingExperiment.versions?.[0]?.id || null,
            }
          ));
          await memoryIngestionService.recordFromStrategy(strategyVersionEvent(result.version, result.experiment?.name));
        }
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async compareStrategiesCopilot(req, res) {
      try {
        const leftExperimentId = getStrategyExperimentId(req.body || {}, [
          "leftExperimentId",
          "leftId",
        ]);
        const rightExperimentId = getStrategyExperimentId(req.body || {}, [
          "rightExperimentId",
          "rightId",
        ]);

        if (!leftExperimentId || !rightExperimentId) {
          res.status(400).json({
            error: "leftExperimentId and rightExperimentId are required.",
          });
          return;
        }

        const [leftExperiment, rightExperiment] = await Promise.all([
          findStrategyForCopilot(req.user.id, leftExperimentId),
          findStrategyForCopilot(req.user.id, rightExperimentId),
        ]);

        if (!leftExperiment || !rightExperiment) {
          res.status(404).json({ error: "One or both strategy experiments were not found." });
          return;
        }

        res.json(await compareStrategiesCopilot(req.user.id, leftExperiment, rightExperiment));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async generateStrategyResearchReport(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        if (!experimentId) {
          res.status(400).json({ error: "experimentId is required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const lifecycle = await getStrategyLifecycleDashboard(prisma, req.user.id);
        const memory = await getStrategyMemory({ userId: req.user.id, experimentId });
        const extras = {
          lifecycle:
            lifecycle?.strategies?.find((item) => item.experimentId === experimentId) || null,
          memory,
          matrixReplay: req.body?.matrixReplay || null,
          portfolioSimulation: req.body?.portfolioSimulation || null,
          regimeAnalysis: req.body?.regimeAnalysis || null,
          walkForwardResult: req.body?.walkForwardResult || null,
          stressResult: req.body?.stressResult || null,
          robustnessResult: req.body?.robustnessResult || null,
        };

        res.json(await generateResearchReport(req.user.id, experiment, extras));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async answerStrategyResearchQuestion(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        const question = String(req.body?.question || "").trim();
        if (!experimentId || !question) {
          res.status(400).json({ error: "experimentId and question are required." });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const lifecycle = await getStrategyLifecycleDashboard(prisma, req.user.id);
        const memory = await getStrategyMemory({ userId: req.user.id, experimentId });
        const extras = {
          lifecycle:
            lifecycle?.strategies?.find((item) => item.experimentId === experimentId) || null,
          memory,
          matrixReplay: req.body?.matrixReplay || null,
          portfolioSimulation: req.body?.portfolioSimulation || null,
          regimeAnalysis: req.body?.regimeAnalysis || null,
          walkForwardResult: req.body?.walkForwardResult || null,
          stressResult: req.body?.stressResult || null,
          robustnessResult: req.body?.robustnessResult || null,
        };

        res.json(await answerResearchQuestion(req.user.id, experiment, question, extras));
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async compareStrategyVersions(req, res) {
      try {
        const experimentId = getStrategyExperimentId(req.body || {}, ["experimentId", "id"]);
        const leftVersionId = String(req.body?.leftVersionId || "").trim();
        const rightVersionId = String(req.body?.rightVersionId || "").trim();

        if (!experimentId || !leftVersionId || !rightVersionId) {
          res.status(400).json({
            error: "experimentId, leftVersionId, and rightVersionId are required.",
          });
          return;
        }

        const experiment = await findStrategyForCopilot(req.user.id, experimentId);
        if (!experiment) {
          res.status(404).json({ error: "Strategy experiment not found." });
          return;
        }

        const leftVersion = experiment.versions?.find((item) => item.id === leftVersionId) || null;
        const rightVersion = experiment.versions?.find((item) => item.id === rightVersionId) || null;

        if (!leftVersion || !rightVersion) {
          res.status(404).json({ error: "One or both strategy versions were not found." });
          return;
        }

        const [leftValidation, rightValidation] = await Promise.all([
          getStrategyValidationAggregate(prisma, req.user.id, {
            strategyVersionId: leftVersion.id,
            strategyId: experiment.id,
          }),
          getStrategyValidationAggregate(prisma, req.user.id, {
            strategyVersionId: rightVersion.id,
            strategyId: experiment.id,
          }),
        ]);

        res.json(await compareStrategyVersions(
          req.user.id,
          experiment,
          leftVersion,
          rightVersion,
          { leftValidation, rightValidation }
        ));
      } catch (error) {
        res.status(error.statusCode || 400).json({
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
        if (memoryIngestionService) { const { backtestEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(backtestEvent(run, experiment.name)); }

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
        if (memoryIngestionService) {
          const version = await prisma.run((db) => db.strategyVersion.findFirst({ where: { userId: req.user.id, experimentId: experiment.id }, orderBy: { version: "desc" } }));
          if (version) { const { robustnessEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(robustnessEvent(version, experiment.name, robustness)); }
        }

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
        if (memoryIngestionService && result.walkForwardRun) { const { walkForwardEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(walkForwardEvent(result.walkForwardRun, experiment.name)); }

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
        const result = await runMonteCarloStress({
          userId: req.user.id,
          experimentId: req.params.id,
          body: req.body || {},
        });
        if (memoryIngestionService && result.stressResult) {
          const experiment = await prisma.run((db) => db.strategyExperiment.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { name: true } }));
          const { monteCarloEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(monteCarloEvent(result.stressResult, experiment?.name || "Strategy"));
        }
        res.status(201).json(result);
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
        const result = await runMatrixReplay({
          userId: req.user.id,
          body: resolvedBody,
        });
        await matrixCopilotService?.recordReplay(req.user.id, resolvedBody, result).catch(() => null);
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async matrixCopilot(req, res) {
      try { res.json(await matrixCopilotService.run(req.user.id, req.body || {})); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); }
    },
    async matrixRecommendation(req, res) { try { res.json(await matrixAdvisorService.recommend(req.user.id, req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); } },
    async matrixScenario(req, res) { try { res.json(await matrixAdvisorService.scenario(req.user.id, req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); } },
    async matrixAlternativeComparison(req, res) { try { res.json(await matrixAdvisorService.compare(req.user.id, req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); } },
    async listMatrixProposals(req, res) { try { res.json({ proposals: await matrixProposalService.list(req.user.id, { includeDeleted: req.query?.includeDeleted === "true" }) }); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async getMatrixProposal(req, res) { try { res.json(await matrixProposalService.get(req.user.id, req.params.id)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async saveMatrixProposal(req, res) { try { res.status(201).json(await matrixProposalService.save(req.user.id, req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); } },
    async renameMatrixProposal(req, res) { try { res.json(await matrixProposalService.rename(req.user.id, req.params.id, req.body?.title)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async duplicateMatrixProposal(req, res) { try { res.status(201).json(await matrixProposalService.duplicate(req.user.id, req.params.id)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async deleteMatrixProposal(req, res) { try { res.json(await matrixProposalService.remove(req.user.id, req.params.id)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async restoreMatrixProposal(req, res) { try { res.json(await matrixProposalService.restore(req.user.id, req.params.id)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async rejectMatrixProposal(req, res) { try { res.json(await matrixProposalService.reject(req.user.id, req.params.id, req.body?.reason)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    async approveMatrixProposal(req, res) { try { res.json(await matrixProposalService.approve(req.user.id, req.params.id, req.body?.reason)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message, details: error.details }); } },

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
