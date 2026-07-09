function createPlaybookController({
  compareVersions: comparePlaybookVersions,
  convertRecommendationToDraft,
  createPlaybook: createPlaybookRecord,
  createPlaybookSnapshot: createPlaybookSnapshotRecord,
  createVersion: createPlaybookVersion,
  generateAiPlaybookRecommendation,
  getPlaybookDashboard,
  getPlaybookSourceData,
  getSnapshot,
  listPlaybooks,
  promoteVersion: promotePlaybookVersion,
  rebuildEvidence: rebuildPlaybookEvidence,
  restoreVersion: restorePlaybookVersion,
  reviewRecommendation,
  sendPlaybookExport,
  syncPlaybook,
}) {
  return {
    async dashboard(req, res) {
      try {
        res.json(await getPlaybookDashboard(
          req.user.id,
          await getPlaybookSourceData(req.user.id),
          req.query.id
        ));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async list(req, res) {
      try {
        res.json({
          playbooks: await listPlaybooks(req.user.id),
          dataSource: "PRISMA",
          degradedMode: false,
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async create(req, res) {
      try {
        res.status(201).json(await createPlaybookRecord(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async detail(req, res) {
      try {
        res.json(
          await getPlaybookDashboard(
            req.user.id,
            await getPlaybookSourceData(req.user.id),
            req.params.id
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async sync(req, res) {
      try {
        const sourceData = await getPlaybookSourceData(req.user.id);
        await syncPlaybook(req.user.id, sourceData, req.body?.playbookId);
        res.json(
          await getPlaybookDashboard(
            req.user.id,
            sourceData,
            req.body?.playbookId
          )
        );
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async createSnapshot(req, res) {
      try {
        const snapshot = await createPlaybookSnapshotRecord(
          req.user.id,
          await getPlaybookSourceData(req.user.id),
          req.body?.playbookId
        );
        res.status(201).json(snapshot);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async restoreSnapshotPreview(req, res) {
      try {
        const snapshot = await getSnapshot(req.user.id, req.params.id);

        if (!snapshot) {
          res.status(404).json({ error: "Playbook version not found." });
          return;
        }

        res.json({
          snapshot,
          restore_payload: null,
          broker_execution_enabled: false,
          live_settings_changed: false,
          message:
            "Restore preview only. Use the version restore action to create a new draft version.",
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async createVersion(req, res) {
      try {
        res.status(201).json(
          await createPlaybookVersion(req.user.id, req.params.id, req.body || {})
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async compareVersions(req, res) {
      try {
        res.json(
          await comparePlaybookVersions(
            req.user.id,
            req.params.id,
            req.body?.leftVersionId,
            req.body?.rightVersionId
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async restoreVersion(req, res) {
      try {
        res.status(201).json(
          await restorePlaybookVersion(
            req.user.id,
            req.params.id,
            req.params.versionId,
            req.body?.changeNote
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async promoteVersion(req, res) {
      try {
        res.status(201).json(
          await promotePlaybookVersion(
            req.user.id,
            req.params.id,
            req.params.versionId,
            req.body?.changeNote
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async rebuildEvidence(req, res) {
      try {
        const dashboard = await getPlaybookDashboard(
          req.user.id,
          await getPlaybookSourceData(req.user.id),
          req.params.id
        );
        const versionId = req.body?.versionId || dashboard.active_version?.id;
        if (!versionId) {
          res.status(409).json({ error: "Playbook has no active version." });
          return;
        }
        res.status(201).json(
          await rebuildPlaybookEvidence(req.user.id, req.params.id, versionId)
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async exportLegacy(req, res) {
      try {
        await sendPlaybookExport(req, res, req.query.id);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async exportById(req, res) {
      try {
        await sendPlaybookExport(req, res, req.params.id);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async generateAiRecommendation(req, res) {
      try {
        const result = await generateAiPlaybookRecommendation(
          req.user.id,
          await getPlaybookSourceData(req.user.id),
          req.params.id
        );

        res.status(result.generated ? 201 : 503).json({
          ...result,
          requires_user_approval: true,
          live_settings_changed: false,
        });
      } catch (error) {
        res.status(500).json({
          error: error.message,
          requires_user_approval: true,
          live_settings_changed: false,
        });
      }
    },

    async acceptRecommendation(req, res) {
      try {
        res.json(
          await reviewRecommendation(
            req.user.id,
            req.params.id,
            "accept",
            req.body?.note
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async rejectRecommendation(req, res) {
      try {
        res.json(
          await reviewRecommendation(
            req.user.id,
            req.params.id,
            "reject",
            req.body?.note
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async convertRecommendationToDraft(req, res) {
      try {
        res.status(201).json(
          await convertRecommendationToDraft(
            req.user.id,
            req.params.id,
            req.body?.note
          )
        );
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },
  };
}

module.exports = createPlaybookController;
