import type {
  EnvironmentId,
  OrchestrationMessage,
  ThreadId,
  ThreadPairSession,
} from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { useMediaQuery } from "../hooks/useMediaQuery";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useThread } from "../state/entities";
import ChatView from "./ChatView";
import { cn } from "../lib/utils";
import { pairPaneClassName, resolvePairPane, type PairPane } from "./PairSessionView.logic";

function latestPeerMessageKey(messages: ReadonlyArray<OrchestrationMessage> | undefined) {
  return (
    messages?.findLast((message) => message.peerMessage !== undefined)?.peerMessage
      ?.pairMessageId ?? null
  );
}

export function PairSessionView({
  environmentId,
  routeThreadId,
  pairSession,
}: {
  environmentId: EnvironmentId;
  routeThreadId: ThreadId;
  pairSession: ThreadPairSession;
}) {
  const isWide = useMediaQuery("lg");
  const routedPane = resolvePairPane(routeThreadId, pairSession);
  const [activePane, setActivePane] = useState<PairPane>(routedPane);
  const leadThread = useThread(scopeThreadRef(environmentId, pairSession.leadThreadId));
  const peerThread = useThread(scopeThreadRef(environmentId, pairSession.peerThreadId));
  const latestPeerKey = useMemo(
    () => ({
      lead: latestPeerMessageKey(leadThread?.messages),
      peer: latestPeerMessageKey(peerThread?.messages),
    }),
    [leadThread?.messages, peerThread?.messages],
  );
  const seenRef = useRef<Record<PairPane, string | null>>({
    lead: latestPeerKey.lead,
    peer: latestPeerKey.peer,
  });

  useEffect(() => {
    setActivePane(routedPane);
  }, [routedPane]);

  useEffect(() => {
    if (isWide) {
      seenRef.current = latestPeerKey;
      return;
    }
    seenRef.current[activePane] = latestPeerKey[activePane];
  }, [activePane, isWide, latestPeerKey]);

  const unread = {
    lead: !isWide && activePane !== "lead" && latestPeerKey.lead !== seenRef.current.lead,
    peer: !isWide && activePane !== "peer" && latestPeerKey.peer !== seenRef.current.peer,
  };
  const renderPane = (pane: PairPane, threadId: ThreadId) => (
    <div
      className={pairPaneClassName({ isWide, pane })}
      data-pair-pane={pane}
      onPointerDownCapture={() => setActivePane(pane)}
      onFocusCapture={() => setActivePane(pane)}
    >
      <ChatView
        environmentId={environmentId}
        threadId={threadId}
        routeKind="server"
        pairPaneActive={activePane === pane}
        pairPaneRole={pane}
        onPairPaneActivate={() => setActivePane(pane)}
        reserveTitleBarControlInset={!isWide || pane === "peer"}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      {!isWide ? (
        <div
          className="flex shrink-0 border-b border-border/70 px-2 pt-[env(safe-area-inset-top)]"
          role="tablist"
          aria-label="Pair session agents"
        >
          {(["lead", "peer"] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={activePane === pane}
              className={cn(
                "relative flex h-10 flex-1 items-center justify-center gap-2 border-b-2 text-sm font-medium capitalize",
                activePane === pane
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
              onClick={() => setActivePane(pane)}
            >
              {pane}
              {unread[pane] ? (
                <span
                  className="size-1.5 rounded-full bg-foreground"
                  aria-label="New peer message"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        {isWide ? (
          <>
            {renderPane("lead", pairSession.leadThreadId)}
            {renderPane("peer", pairSession.peerThreadId)}
          </>
        ) : activePane === "lead" ? (
          renderPane("lead", pairSession.leadThreadId)
        ) : (
          renderPane("peer", pairSession.peerThreadId)
        )}
      </div>
    </div>
  );
}
