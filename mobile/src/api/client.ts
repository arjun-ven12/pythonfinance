export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  verificationStatus: string;
  pageAccess?: Record<string, boolean>;
};
export type Session = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: User;
};
export interface TokenStorage {
  read(): Promise<Session | null>;
  write(session: Session): Promise<void>;
  clear(): Promise<void>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
}
export function validateBaseUrl(value: string, development = false) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "Use a backend origin without credentials or query parameters.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      development &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname)
    )
  )
    throw Error("An authenticated HTTPS backend is required.");
  return url.origin;
}
export function createApiClient({
  baseUrl,
  storage,
  onExpired,
  fetcher = fetch,
}: {
  baseUrl: string;
  storage: TokenStorage;
  onExpired: () => void;
  fetcher?: typeof fetch;
}) {
  let refresh: Promise<Session> | null = null;
  let generation = 0;
  let commits: Promise<unknown> = Promise.resolve();
  function commit<T>(work: () => Promise<T>) {
    const next = commits.then(work, work);
    commits = next.catch(() => {});
    return next;
  }
  async function decode<T>(response: Response): Promise<T> {
    const data =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        data?.error || `Request failed (${response.status}).`,
        response.status,
        data?.code,
      );
    if (
      response.headers.get("X-Degraded-Mode") === "true" ||
      data?.degradedMode === true ||
      data?.dataSource === "UNAVAILABLE"
    )
      throw new ApiError(
        "The server reports degraded data. Refresh before acting.",
        503,
      );
    return data as T;
  }
  async function send<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    token?: string,
  ) {
    if (!path.startsWith("/api/"))
      throw Error("Only platform API paths are permitted.");
    return decode<T>(
      await fetcher(`${baseUrl}${path}`, {
        method,
        credentials: "omit",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(
          method !== "GET" &&
            /^\/api\/(ai|research|strategy-experiments|portfolio\/copilot)/.test(
              path,
            )
            ? 120000
            : 30000,
        ),
      }),
    );
  }
  async function renew() {
    if (!refresh) {
      const currentGeneration = generation;
      refresh = (async () => {
        const session = await storage.read();
        if (!session) throw new ApiError("Sign in to continue.", 401);
        const next = await send<Session>("/api/auth/mobile/refresh", {
          refreshToken: session.refreshToken,
        });
        if (generation !== currentGeneration)
          throw new ApiError("Session changed.", 401);
        await commit(async () => {
          if (generation !== currentGeneration)
            throw new ApiError("Session changed.", 401);
          await storage.write(next);
        });
        if (generation !== currentGeneration)
          throw new ApiError("Session changed.", 401);
        return next;
      })()
        .catch(async (error) => {
          if (
            generation === currentGeneration &&
            error instanceof ApiError &&
            error.status === 401
          ) {
            generation++;
            await commit(async () => {
              await storage.clear();
              onExpired();
            });
          }
          throw error;
        })
        .finally(() => {
          refresh = null;
        });
    }
    return refresh;
  }
  return {
    async login(email: string, password: string) {
      generation++;
      const version = generation;
      const session = await send<Session>("/api/auth/mobile/login", {
        email,
        password,
      });
      if (version !== generation) throw new ApiError("Session changed.", 401);
      await commit(async () => {
        if (version !== generation) throw new ApiError("Session changed.", 401);
        await storage.write(session);
      });
      return session.user;
    },
    async request<T = Record<string, unknown>>(
      path: string,
      body?: unknown,
      method?: string,
    ): Promise<T> {
      const session = await storage.read();
      if (!session) throw new ApiError("Sign in to continue.", 401);
      try {
        return await send<T>(path, body, method, session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const next = await renew();
        return send<T>(path, body, method, next.accessToken);
      }
    },
    renew,
    async logout() {
      const version = ++generation;
      const session = await storage.read();
      // Retain the refresh credential until revocation is acknowledged. Offline
      // sign-out is explicit in UI; never falsely claim server revocation.
      if (session)
        await send("/api/auth/mobile/logout", {
          refreshToken: session.refreshToken,
        });
      await commit(async () => {
        if (version === generation) {
          await storage.clear();
          onExpired();
        }
      });
    },
    async forgetLocally() {
      const version = ++generation;
      await commit(async () => {
        if (version === generation) {
          await storage.clear();
          onExpired();
        }
      });
    },
  };
}
