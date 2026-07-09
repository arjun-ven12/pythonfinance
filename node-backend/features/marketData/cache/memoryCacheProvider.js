function createMemoryCacheProvider() {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return null;
    }

    return entry;
  }

  function set(key, value, ttlMs) {
    const expiresAt = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
      ? Date.now() + Number(ttlMs)
      : null;
    const entry = {
      value,
      expiresAt,
      storedAt: Date.now(),
    };
    store.set(key, entry);
    return entry;
  }

  function deleteKey(key) {
    store.delete(key);
  }

  function clear() {
    store.clear();
  }

  function size() {
    return store.size;
  }

  return {
    clear,
    delete: deleteKey,
    get,
    set,
    size,
  };
}

module.exports = createMemoryCacheProvider;
