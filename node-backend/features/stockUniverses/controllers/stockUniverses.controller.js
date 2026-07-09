function createStockUniversesController(deps) {
  const {
    addStockUniverseMembers,
    createStockUniverse,
    deleteStockUniverse,
    getStockUniverseById,
    listStockUniverses,
    removeStockUniverseMember,
    updateStockUniverse,
  } = deps;

  return {
    async list(req, res) {
      try {
        res.json({
          universes: await listStockUniverses(req.user.id),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async get(req, res) {
      try {
        const universe = await getStockUniverseById(req.user.id, req.params.id);
        if (!universe) {
          res.status(404).json({ error: "Stock universe not found." });
          return;
        }
        res.json(universe);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async create(req, res) {
      try {
        res.status(201).json(await createStockUniverse(req.user.id, req.body || {}));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async update(req, res) {
      try {
        res.json(await updateStockUniverse(req.user.id, req.params.id, req.body || {}));
      } catch (error) {
        res.status(error.message.includes("not found") ? 404 : 400).json({
          error: error.message,
        });
      }
    },

    async remove(req, res) {
      try {
        await deleteStockUniverse(req.user.id, req.params.id);
        res.status(204).end();
      } catch (error) {
        res.status(error.message.includes("not found") ? 404 : 400).json({
          error: error.message,
        });
      }
    },

    async addMembers(req, res) {
      try {
        res.json(await addStockUniverseMembers(req.user.id, req.params.id, req.body || {}));
      } catch (error) {
        res.status(error.message.includes("not found") ? 404 : 400).json({
          error: error.message,
        });
      }
    },

    async removeMember(req, res) {
      try {
        await removeStockUniverseMember(
          req.user.id,
          req.params.id,
          req.params.symbol
        );
        res.status(204).end();
      } catch (error) {
        res.status(error.message.includes("not found") ? 404 : 400).json({
          error: error.message,
        });
      }
    },
  };
}

module.exports = { createStockUniversesController };
