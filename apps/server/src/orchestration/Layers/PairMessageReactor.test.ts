import {
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThread,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { it as effectIt } from "@effect/vitest";
import { describe, expect, it } from "vite-plus/test";

import { ProjectionThreadMessageRepository } from "../../persistence/Services/ProjectionThreadMessages.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { PairMessageReactor } from "../Services/PairMessageReactor.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { extractPeerMessages, PairMessageReactorLive } from "./PairMessageReactor.ts";
import { providerTurnMessageText } from "./ProviderCommandReactor.ts";

const CREATED_AT = "2026-08-12T12:00:00.000Z";

function shell(id: string, pairSessionId: string): OrchestrationThreadShell {
  return {
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-1"),
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: "/repo",
    latestTurn: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    pairSession: {
      id: pairSessionId,
      leadThreadId: ThreadId.make("lead"),
      peerThreadId: ThreadId.make("peer"),
    },
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

function reactorLayer(input: {
  readonly currentPairSessionId: string;
  readonly sourcePairSessionId: string;
  readonly dispatches: OrchestrationCommand[];
  readonly pendingPeerMessageIds?: ReadonlyArray<string>;
  readonly lookedUpMessageIds?: MessageId[];
}) {
  const sourceMessage = {
    messageId: MessageId.make("assistant-source"),
    threadId: ThreadId.make("lead"),
    turnId: null,
    role: "assistant" as const,
    text: "<peer_message>Already delivered from this message.</peer_message><peer_message>Review the implementation.</peer_message>",
    pairSessionId: input.sourcePairSessionId,
    isStreaming: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const deliveredHistoricalMessage = {
    ...sourceMessage,
    messageId: MessageId.make("assistant-delivered"),
    text: "<peer_message>Already delivered.</peer_message>",
  };
  const currentShell = shell("lead", input.currentPairSessionId);
  const currentThread = {
    ...currentShell,
    pairState: {
      pendingTurnMessageId: null,
      pendingPeerMessageIds: input.pendingPeerMessageIds ?? ["pair-a:assistant-source:1"],
    },
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
  } satisfies OrchestrationThread;
  return PairMessageReactorLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(OrchestrationEngineService)({
          readEvents: () => Stream.empty,
          streamDomainEvents: Stream.empty,
          latestSequence: Effect.succeed(0),
          dispatch: (command) => {
            input.dispatches.push(command);
            return Effect.succeed({ sequence: input.dispatches.length });
          },
        }),
        Layer.mock(ProjectionSnapshotQuery)({
          getCommandReadModel: () =>
            Effect.succeed({
              snapshotSequence: 1,
              projects: [],
              threads: [currentThread],
              updatedAt: CREATED_AT,
            }),
          getThreadShellById: () => Effect.succeed(Option.some(currentShell)),
        }),
        Layer.mock(ProjectionThreadMessageRepository)({
          getByMessageId: ({ messageId }) => {
            input.lookedUpMessageIds?.push(messageId);
            return Effect.succeed(
              messageId === sourceMessage.messageId
                ? Option.some(sourceMessage)
                : messageId === deliveredHistoricalMessage.messageId
                  ? Option.some(deliveredHistoricalMessage)
                  : Option.none(),
            );
          },
        }),
      ),
    ),
  );
}

describe("Pair messages", () => {
  it("extracts each complete non-empty T3 agent block and accepts legacy blocks", () => {
    expect(
      extractPeerMessages(
        'before <t3_agent_message> first </t3_agent_message> between <t3_agent_message recipient="agent">\nsecond\n</t3_agent_message   > after',
      ),
    ).toEqual(["first", "second"]);
    expect(extractPeerMessages("<t3_agent_message>incomplete")).toEqual([]);
    expect(extractPeerMessages("<t3_agent_message>   </t3_agent_message>")).toEqual([]);
    expect(extractPeerMessages("<peer_message>legacy</peer_message>")).toEqual(["legacy"]);
  });

  it("adds provider provenance without changing stored text", () => {
    expect(providerTurnMessageText({ text: "Please review this.", peerMessage: {} })).toBe(
      "Message from the other T3 Code agent:\n\nPlease review this.",
    );
    expect(providerTurnMessageText({ text: "Human request" })).toBe("Human request");
  });

  effectIt.effect("recovers an unforwarded completed Pair message on startup", () => {
    const dispatches: OrchestrationCommand[] = [];
    const lookedUpMessageIds: MessageId[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const reactor = yield* PairMessageReactor;
        yield* reactor.start();
        yield* reactor.drain;

        expect(dispatches).toEqual([
          expect.objectContaining({
            type: "thread.pair.message.forward",
            commandId: "pair-message:pair-a:assistant-source:1",
            pairSessionId: "pair-a",
            text: "Review the implementation.",
          }),
        ]);
        expect(lookedUpMessageIds).toEqual([MessageId.make("assistant-source")]);
      }),
    ).pipe(
      Effect.provide(
        reactorLayer({
          currentPairSessionId: "pair-a",
          sourcePairSessionId: "pair-a",
          dispatches,
          pendingPeerMessageIds: ["pair-a:assistant-source:1"],
          lookedUpMessageIds,
        }),
      ),
    );
  });

  effectIt.effect("does not forward a Pair A message after the thread starts Pair B", () => {
    const dispatches: OrchestrationCommand[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const reactor = yield* PairMessageReactor;
        yield* reactor.start();
        yield* reactor.drain;

        expect(dispatches).toEqual([]);
      }),
    ).pipe(
      Effect.provide(
        reactorLayer({
          currentPairSessionId: "pair-b",
          sourcePairSessionId: "pair-a",
          dispatches,
        }),
      ),
    );
  });
});
