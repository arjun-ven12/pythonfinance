function createPaperExecutionController({
  getApprovalRequestById,
  getDecisionNote,
  getRequestOrderPayload,
  persistPaperExecutionResult,
  runPaperOrder,
}) {
  return {
    async executePaperOrder(req, res) {
      try {
        const approvalRequestId = String(
          req.body?.approvalRequestId || req.body?.approval_request_id || ""
        ).trim();

        if (!approvalRequestId) {
          res.status(400).json({
            error: "approvalRequestId is required for paper execution.",
          });
          return;
        }

        const request = await getApprovalRequestById(
          approvalRequestId,
          req.user.id
        );

        if (!request) {
          res.status(404).json({ error: "Approval request not found." });
          return;
        }

        if (request.status !== "APPROVED") {
          res.status(409).json({
            error: "Approval request must be APPROVED before paper execution.",
          });
          return;
        }

        const result = await runPaperOrder(
          getRequestOrderPayload(request),
          req.user.id
        );

        let persisted = null;
        if (result.filled) {
          persisted = await persistPaperExecutionResult(
            req.user.id,
            request.id,
            result,
            {
              raw: {
                paper_execution: result,
              },
            },
            getDecisionNote(req.body || {}) || null
          );
        }

        res
          .status(result.filled ? 201 : 202)
          .json(persisted?.paper_execution || result);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          details: error.details,
        });
      }
    },
  };
}

module.exports = createPaperExecutionController;
