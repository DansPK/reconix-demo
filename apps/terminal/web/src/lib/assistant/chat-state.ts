export interface ChatStateMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  state?: string;
  question?: string;
}

export function canStartAsk(params: { question: string; hasStream: boolean; reading: boolean; configured: boolean }): boolean {
  return Boolean(params.question && !params.hasStream && !params.reading && params.configured);
}

export function canRetryLast(
  messages: readonly ChatStateMessage[],
  params: { hasStream: boolean; reading: boolean; configured: boolean },
): ChatStateMessage | null {
  if (params.hasStream || params.reading || !params.configured) return null;
  const last = messages.at(-1);
  return last?.role === "assistant" && last.state === "error" && last.question ? last : null;
}

export function isStaleStream(active: AbortController | null, mine: AbortController): boolean {
  return active !== mine || mine.signal.aborted;
}

export function createEpochGuard() {
  let epoch = 0;
  return {
    next: () => ++epoch,
    current: () => epoch,
    isCurrent: (value: number) => value === epoch,
  };
}

export function scrollTriggerKey(messages: readonly ChatStateMessage[]): string | null {
  return [...messages].reverse().find((message) => message.role === "user")?.id ?? null;
}

export function viewSessionKey(messages: readonly ChatStateMessage[], conversationId: string | null): string {
  return messages[0]?.id ?? conversationId ?? "new";
}

export function resolveAskScope<T extends { uid: string | null }>(openedScope: T | null | undefined, dashboardScope: T): T {
  return openedScope ?? dashboardScope;
}

export function completedStreamOutcome(active: AbortController | null, mine: AbortController): "drop" | "stopped" | "apply" {
  if (active !== mine) return "drop";
  return mine.signal.aborted ? "stopped" : "apply";
}
