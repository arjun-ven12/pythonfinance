import { object, number, text } from "../utils/data";
export function createSequenceGuard() {
  let last = 0;
  return {
    accept(value: unknown) {
      const n = number(value);
      if (n === null || !Number.isInteger(n) || n < 1) return "gap" as const;
      if (n <= last) return "duplicate" as const;
      const gap = n !== last + 1;
      last = n;
      return gap ? ("gap" as const) : ("accept" as const);
    },
    reset() {
      last = 0;
    },
  };
}
export type StreamSocket = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
};
export function connectQuotes({
  url,
  symbols,
  socketFactory,
  onQuote,
  onReconcile,
  onUnauthorized,
  onState,
}: {
  url: string;
  symbols: string[];
  socketFactory: (url: string) => Promise<StreamSocket>;
  onQuote: (symbol: string, payload: Record<string, unknown>) => void;
  onReconcile: () => void;
  onUnauthorized: () => Promise<void>;
  onState: (state: string) => void;
}) {
  let stopped = false;
  let attempts = 0;
  let socket: StreamSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clean = [...new Set(symbols)]
    .filter((s) => /^[A-Z0-9.^=_-]{1,32}$/.test(s))
    .slice(0, 25);
  async function open() {
    if (stopped || !clean.length) return;
    onState("connecting");
    const guard = createSequenceGuard();
    try {
      const next = await socketFactory(url);
      if (stopped) {
        next.close();
        return;
      }
      socket = next;
      next.onopen = () => {
        attempts = 0;
        onState("connected");
        onReconcile();
        for (const symbol of clean)
          next.send(JSON.stringify({ action: "subscribeQuote", symbol }));
      };
      next.onmessage = (event) => {
        try {
          const message = object(JSON.parse(event.data));
          const sequence = guard.accept(message.sequence);
          if (sequence === "duplicate") return;
          if (sequence === "gap") {
            onReconcile();
            return;
          }
          if (message.channel === "quote")
            onQuote(text(message.symbol), object(message.payload));
        } catch {
          onReconcile();
        }
      };
      next.onerror = () => {
        onState("disconnected");
        next.close();
      };
      next.onclose = (event) => {
        if (stopped) return;
        onState("disconnected");
        onReconcile();
        void retry(event.code === 4401);
      };
    } catch {
      void retry(false);
    }
  }
  async function retry(expired: boolean) {
    if (stopped) return;
    if (expired) {
      try {
        await onUnauthorized();
      } catch {
        onState("session expired");
        return;
      }
    }
    if (!stopped)
      timer = setTimeout(
        () => void open(),
        Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
      );
  }
  void open();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (socket) socket.close();
    onState("paused");
  };
}
