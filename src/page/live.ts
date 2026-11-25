export type LiveState = "live" | "reconnecting";

/**
 * Holds the `/events` stream and opens it again when it dies. The server pushes at least every 30 s, so no push for
 * `staleMs` means a dead stream. A closed source opens again after `retryMs × 2^attempt`, at most 10 s.
 * The browser retries a source that is still connecting by itself.
 */
export function liveStream(o: {
  open: () => EventSource;
  onTree: (data: string) => void;
  onState: (s: LiveState) => void;
  staleMs?: number;
  retryMs?: number;
}) {
  const staleMs = o.staleMs ?? 75_000;
  const retryMs = o.retryMs ?? 1000;
  /** Unset until the first push, so the first push always reports "live". */
  let state: LiveState | undefined;
  let attempt = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let es: EventSource;

  const set = (s: LiveState) => {
    if (s === state) return;
    state = s;
    o.onState(s);
  };
  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      set("reconnecting");
      restart();
    }, staleMs);
  };
  const start = () => {
    es = o.open();
    es.onmessage = (e) => {
      attempt = 0;
      set("live");
      arm();
      o.onTree(e.data);
    };
    es.onerror = () => {
      set("reconnecting");
      /** `EventSource.CLOSED`: the browser gave up on this source. */
      if (es.readyState !== 2) return;
      clearTimeout(retry);
      retry = setTimeout(restart, Math.min(retryMs * 2 ** attempt++, 10_000));
    };
    arm();
  };
  const restart = () => {
    clearTimeout(retry);
    es.close();
    start();
  };

  start();
  return {
    reconnect: () => {
      attempt = 0;
      restart();
    },
    close: () => {
      clearTimeout(watchdog);
      clearTimeout(retry);
      es.close();
    },
  };
}
