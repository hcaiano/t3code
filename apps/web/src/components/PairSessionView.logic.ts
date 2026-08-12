import type { ThreadId, ThreadPairSession } from "@t3tools/contracts";

export type PairPane = "lead" | "peer";

export function resolvePairPane(
  routeThreadId: ThreadId,
  pairSession: Pick<ThreadPairSession, "leadThreadId" | "peerThreadId">,
): PairPane {
  return routeThreadId === pairSession.peerThreadId ? "peer" : "lead";
}
