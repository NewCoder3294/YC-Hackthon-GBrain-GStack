import { getConfig } from "./config";
import { log } from "./logger";

/**
 * In-memory rolling-window rate limiter for LLM calls.
 *
 * Two caps:
 *   - Per-tick:  hard ceiling on how many enrichments fire in a single tick.
 *   - Per-hour:  sliding 60-min window so a runaway tick can't burn the
 *                whole day's tokens.
 *
 * Token usage is logged but not capped (latency-wise it's hard to reason
 * about; we let call-count do the policing). If a tick fires 5 enrichments
 * and each uses 800 tokens, that's 4k tokens — easy to budget.
 */

interface CallRecord {
  ts: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

const HOUR_MS = 60 * 60 * 1000;

class CallBudget {
  private rolling: CallRecord[] = [];

  /** Discard records older than 1 hour. Called before every check. */
  private prune(): void {
    const cutoff = Date.now() - HOUR_MS;
    while (this.rolling.length > 0 && this.rolling[0]!.ts < cutoff) {
      this.rolling.shift();
    }
  }

  /** Should the next call proceed? Returns false when caps would be exceeded. */
  canCall(callsThisTick: number): { ok: boolean; reason?: string } {
    const cfg = getConfig();
    if (!cfg.LLM_ENABLED) return { ok: false, reason: "LLM_ENABLED=false" };

    if (callsThisTick >= cfg.LLM_MAX_CALLS_PER_TICK) {
      return { ok: false, reason: "per-tick cap reached" };
    }

    this.prune();
    if (this.rolling.length >= cfg.LLM_MAX_CALLS_PER_HOUR) {
      return { ok: false, reason: "per-hour cap reached" };
    }
    return { ok: true };
  }

  record(usage: Omit<CallRecord, "ts">): void {
    this.rolling.push({ ts: Date.now(), ...usage });
    this.prune();
    log.info({
      scope: "budget",
      msg: "llm call accounted",
      extra: {
        rolling_count: this.rolling.length,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_creation_tokens: usage.cacheCreationTokens,
      },
    });
  }

  snapshot() {
    this.prune();
    const totals = this.rolling.reduce(
      (acc, r) => ({
        in: acc.in + r.inputTokens,
        out: acc.out + r.outputTokens,
        cacheRead: acc.cacheRead + r.cacheReadTokens,
        cacheCreate: acc.cacheCreate + r.cacheCreationTokens,
      }),
      { in: 0, out: 0, cacheRead: 0, cacheCreate: 0 },
    );
    return {
      calls_last_hour: this.rolling.length,
      input_tokens: totals.in,
      output_tokens: totals.out,
      cache_read_tokens: totals.cacheRead,
      cache_creation_tokens: totals.cacheCreate,
    };
  }
}

export const callBudget = new CallBudget();
