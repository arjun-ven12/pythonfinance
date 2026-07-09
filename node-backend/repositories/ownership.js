function requireUserId(userId) {
  const normalized = String(userId || "").trim();

  if (!normalized) {
    throw new Error("Authenticated user ownership is required.");
  }

  return normalized;
}

function ownedWhere(userId, where = {}) {
  return {
    ...where,
    userId: requireUserId(userId),
  };
}

module.exports = {
  ownedWhere,
  requireUserId,
};
