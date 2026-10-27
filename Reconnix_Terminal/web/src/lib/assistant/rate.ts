/* A small brake on the assistant route (per dashboard process): at most PER_MINUTE questions a
   minute and RUNNING replies at once, so a stuck page can't flood the model. Both can be set
   with RECONIX_ASSISTANT_RATE_PER_MINUTE and RECONIX_ASSISTANT_RATE_RUNNING (positive whole
   numbers; anything else keeps the default), e.g. higher for the e2e tests' server. */

export const PER_MINUTE = 12;
export const RUNNING = 2;

const positive = (raw: string | undefined, fallback: number) => {
  const value = raw?.trim() ?? "";
  return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : fallback;
};

/** [per minute, at once] from the environment. */
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): [number, number] {
  return [positive(env.RECONIX_ASSISTANT_RATE_PER_MINUTE, PER_MINUTE), positive(env.RECONIX_ASSISTANT_RATE_RUNNING, RUNNING)];
}

export function createLimiter(perMinute = PER_MINUTE, running = RUNNING) {
  const recent: number[] = [];
  let open = 0;
  return {
    /** A slot for one reply, or null; call the returned release() when the reply ends. */
    take(now: number = Date.now()): (() => void) | null {
      while (recent.length && now - recent[0] >= 60_000) recent.shift();
      if (recent.length >= perMinute || open >= running) return null;
      recent.push(now);
      open += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          open -= 1;
        }
      };
    },
  };
}
