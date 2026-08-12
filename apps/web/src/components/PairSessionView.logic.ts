import type { ThreadId, ThreadPairSession } from "@t3tools/contracts";

export type PairPane = "lead" | "peer";

export function pairPaneClassName(input: { readonly isWide: boolean; readonly pane: PairPane }) {
  return [
    "flex min-h-0 min-w-0 flex-1 overflow-hidden",
    input.isWide && input.pane === "lead" ? "border-r border-border/70" : null,
  ]
    .filter((className): className is string => className !== null)
    .join(" ");
}

export function resolvePairPane(
  routeThreadId: ThreadId,
  pairSession: Pick<ThreadPairSession, "leadThreadId" | "peerThreadId">,
): PairPane {
  return routeThreadId === pairSession.peerThreadId ? "peer" : "lead";
}
