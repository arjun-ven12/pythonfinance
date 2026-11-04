import {
  createApiClient,
  Session,
  TokenStorage,
  validateBaseUrl,
  ApiError,
} from "../src/api/client";
const session: Session = {
  accessToken: "old",
  refreshToken: "refresh",
  sessionId: "s",
  user: {
    id: "u",
    name: "Test",
    email: "test@example.invalid",
    role: "LEVEL_1_USER",
    verificationStatus: "VERIFIED",
  },
};
function fixture(fetcher: typeof fetch) {
  let stored: Session | null = session;
  const storage: TokenStorage = {
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
  const expired = jest.fn();
  return {
    client: createApiClient({
      baseUrl: "https://api.example.com",
      storage,
      onExpired: expired,
      fetcher,
    }),
    expired,
    storage,
  };
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
it("rejects insecure production URLs and embedded credentials", () => {
  expect(() => validateBaseUrl("http://api.example.com")).toThrow();
  expect(() =>
    validateBaseUrl("https://user:password@api.example.com"),
  ).toThrow();
  expect(validateBaseUrl("http://10.0.2.2:3000", true)).toBe(
    "http://10.0.2.2:3000",
  );
});
it("renews a concurrent expired session once and attaches native bearer headers", async () => {
  let refreshes = 0;
  const transport: typeof fetch = jest.fn(async (input, init) => {
    if (String(input).endsWith("/refresh")) {
      refreshes++;
      return response({
        ...session,
        accessToken: "new",
        refreshToken: "rotated",
      });
    }
    expect(init?.credentials).toBe("omit");
    return init?.headers &&
      new Headers(init.headers).get("Authorization") === "Bearer new"
      ? response({ equity: 123.45 })
      : response({ error: "expired" }, 401);
  });
  const { client } = fixture(transport);
  const values = await Promise.all([
    client.request("/api/portfolio"),
    client.request("/api/orders"),
  ]);
  expect(values[0]?.equity).toBe(123.45);
  expect(refreshes).toBe(1);
});
it("clears rejected refresh credentials and reports session expiration", async () => {
  const { client, storage, expired } = fixture(
    jest.fn(async () => response({ error: "revoked" }, 401)),
  );
  await expect(client.request("/api/private")).rejects.toBeInstanceOf(ApiError);
  expect(await storage.read()).toBeNull();
  expect(expired).toHaveBeenCalledTimes(1);
});
it("never retries an uncertain mutation or fabricates degraded balances", async () => {
  const transport = jest.fn(async () => {
    throw new TypeError("Offline");
  });
  const { client } = fixture(transport);
  await expect(client.request("/api/execution/stop", {})).rejects.toThrow(
    "Offline",
  );
  expect(transport).toHaveBeenCalledTimes(1);
  const degraded = fixture(
    jest.fn(async () =>
      response({ equity: 0, degradedMode: true, dataSource: "UNAVAILABLE" }),
    ),
  );
  await expect(degraded.client.request("/api/paper-portfolio")).rejects.toThrow(
    "degraded",
  );
});
it("offline sign-out does not falsely claim server revocation", async () => {
  const { client, storage, expired } = fixture(
    jest.fn(async () => {
      throw Error("Disconnected");
    }),
  );
  await expect(client.logout()).rejects.toThrow();
  expect(await storage.read()).not.toBeNull();
  expect(expired).not.toHaveBeenCalled();
  await client.forgetLocally();
  expect(await storage.read()).toBeNull();
});
it("a late refresh cannot resurrect credentials after local session removal", async () => {
  let stored: Session | null = session;
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const storage: TokenStorage = {
    read: async () => stored,
    clear: async () => {
      stored = null;
    },
    write: async (value) => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      stored = value;
    },
  };
  const client = createApiClient({
    baseUrl: "https://api.example.com",
    storage,
    onExpired: jest.fn(),
    fetcher: jest.fn(async () => response({ ...session, accessToken: "late" })),
  });
  const renewal = client.renew().catch((e) => e);
  await writing;
  const forgetting = client.forgetLocally();
  release();
  await Promise.all([renewal, forgetting]);
  expect(stored).toBeNull();
});
