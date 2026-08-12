import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const CREATED_AT = "2026-08-12T12:00:00.000Z";

function thread(id: string, projectId = "project-1", worktreePath: string | null = "/repo") {
  return {
    id: ThreadId.make(id),
    projectId: ProjectId.make(projectId),
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath,
    latestTurn: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  } satisfies OrchestrationThread;
}

function readModel(threads: ReadonlyArray<OrchestrationThread>): OrchestrationReadModel {
  return { snapshotSequence: 0, projects: [], threads, updatedAt: CREATED_AT };
}

it.layer(NodeServices.layer)("Pair Session decider", (it) => {
  it.effect("links and starts both equal agents with bootstrap instructions", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.start",
          commandId: CommandId.make("pair-start"),
          threadId: ThreadId.make("lead"),
          peerThreadId: ThreadId.make("peer"),
          pairSessionId: "pair-1",
          createdAt: CREATED_AT,
        },
        readModel: readModel([thread("lead"), thread("peer")]),
      });
      const events = Array.isArray(result) ? result : [result];

      expect(events.map((event) => event.type)).toEqual([
        "thread.meta-updated",
        "thread.message-sent",
        "thread.turn-start-requested",
        "thread.meta-updated",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);
      const prompts = events
        .filter((event) => event.type === "thread.message-sent")
        .map((event) => event.payload.text);
      expect(prompts[0]).toContain("First, send the peer a concise task and progress summary");
      expect(prompts[1]).toContain("Begin after its task summary");
      expect(prompts.every((prompt) => prompt.includes("<peer_message>"))).toBe(true);
    }),
  );

  it.effect("rejects immediate end, then ends after both Pair turns are handled", () =>
    Effect.gen(function* () {
      let model = readModel([thread("lead"), thread("peer")]);
      const start = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.start",
          commandId: CommandId.make("pair-start-project"),
          threadId: ThreadId.make("lead"),
          peerThreadId: ThreadId.make("peer"),
          pairSessionId: "pair-1",
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      for (const [index, event] of (Array.isArray(start) ? start : [start]).entries()) {
        model = yield* projectEvent(model, { ...event, sequence: index + 1 });
      }
      expect(model.threads.map((entry) => entry.pairSession?.id)).toEqual(["pair-1", "pair-1"]);

      const immediateEnd = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.end",
            commandId: CommandId.make("pair-end-immediate"),
            threadId: ThreadId.make("peer"),
            createdAt: CREATED_AT,
          },
          readModel: model,
        }),
      );
      expect(immediateEnd._tag).toBe("Failure");

      const staleReady = yield* decideOrchestrationCommand({
        command: {
          type: "thread.session.set",
          commandId: CommandId.make("stale-ready-before-pair-bootstrap"),
          threadId: ThreadId.make("lead"),
          session: {
            threadId: ThreadId.make("lead"),
            status: "ready",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: CREATED_AT,
          },
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      const staleReadyEvent = Array.isArray(staleReady) ? staleReady.at(-1) : staleReady;
      if (staleReadyEvent) {
        model = yield* projectEvent(model, { ...staleReadyEvent, sequence: 9 });
      }
      expect(model.threads[0]?.pairState?.pendingTurnMessageId).toBe("pair:pair-1:lead:start");

      for (const [index, threadId] of ["lead", "peer"].entries()) {
        const handled = yield* decideOrchestrationCommand({
          command: {
            type: "thread.session.set",
            commandId: CommandId.make(`pair-bootstrap-handled-${threadId}`),
            threadId: ThreadId.make(threadId),
            session: {
              threadId: ThreadId.make(threadId),
              status: "ready",
              providerName: "codex",
              runtimeMode: "full-access",
              activeTurnId: null,
              lastError: null,
              updatedAt: CREATED_AT,
            },
            turnStartMessageId: MessageId.make(`pair:pair-1:${threadId}:start`),
            createdAt: CREATED_AT,
          },
          readModel: model,
        });
        const handledEvent = Array.isArray(handled) ? handled.at(-1) : handled;
        if (handledEvent) {
          model = yield* projectEvent(model, { ...handledEvent, sequence: 10 + index });
        }
      }

      const end = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.end",
          commandId: CommandId.make("pair-end"),
          threadId: ThreadId.make("peer"),
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      expect((Array.isArray(end) ? end : [end]).map((event) => event.payload)).toEqual([
        expect.objectContaining({ threadId: "lead", pairSession: null }),
        expect.objectContaining({ threadId: "peer", pairSession: null }),
      ]);
    }),
  );

  it.effect("rejects threads from different projects or worktrees", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.start",
            commandId: CommandId.make("pair-invalid"),
            threadId: ThreadId.make("lead"),
            peerThreadId: ThreadId.make("peer"),
            pairSessionId: "pair-1",
            createdAt: CREATED_AT,
          },
          readModel: readModel([thread("lead"), thread("peer", "project-2")]),
        }),
      );
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("rejects an archived thread", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.start",
            commandId: CommandId.make("pair-archived"),
            threadId: ThreadId.make("lead"),
            peerThreadId: ThreadId.make("peer"),
            pairSessionId: "pair-1",
            createdAt: CREATED_AT,
          },
          readModel: readModel([thread("lead"), { ...thread("peer"), archivedAt: CREATED_AT }]),
        }),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("archived thread");
      }
    }),
  );

  it.effect("forwards one visible system/user message pair with shared provenance", () =>
    Effect.gen(function* () {
      const pairSession = {
        id: "pair-1",
        leadThreadId: ThreadId.make("lead"),
        peerThreadId: ThreadId.make("peer"),
      };
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.message.forward",
          commandId: CommandId.make("pair-message:pair-1:source:0"),
          threadId: ThreadId.make("lead"),
          pairSessionId: "pair-1",
          pairMessageId: "pair-1:source:0",
          senderMessageId: MessageId.make("sender-message"),
          receiverMessageId: MessageId.make("receiver-message"),
          text: "Please review the contract.",
          createdAt: CREATED_AT,
        },
        readModel: readModel([
          { ...thread("lead"), pairSession },
          { ...thread("peer"), pairSession },
        ]),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual([
        "thread.message-sent",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);
      const messageEvents = events.filter((event) => event.type === "thread.message-sent");
      expect(messageEvents.map((event) => event.payload.role)).toEqual(["system", "user"]);
      expect(messageEvents[0]?.payload.peerMessage).toEqual(messageEvents[1]?.payload.peerMessage);
      expect(messageEvents[0]?.payload.peerMessage).toEqual({
        pairSessionId: "pair-1",
        pairMessageId: "pair-1:source:0",
        fromThreadId: "lead",
        toThreadId: "peer",
      });
    }),
  );

  it.effect("clears the other thread before deleting one Pair member", () =>
    Effect.gen(function* () {
      const pairSession = {
        id: "pair-1",
        leadThreadId: ThreadId.make("lead"),
        peerThreadId: ThreadId.make("peer"),
      };
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.delete",
          commandId: CommandId.make("delete-lead"),
          threadId: ThreadId.make("lead"),
        },
        readModel: readModel([
          { ...thread("lead"), pairSession },
          { ...thread("peer"), pairSession },
        ]),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual([
        "thread.meta-updated",
        "thread.meta-updated",
        "thread.deleted",
      ]);
      expect(events[1]?.payload).toEqual(
        expect.objectContaining({ threadId: "peer", pairSession: null }),
      );
    }),
  );

  it.effect("rejects Pair end while either agent is active", () =>
    Effect.gen(function* () {
      const pairSession = {
        id: "pair-1",
        leadThreadId: ThreadId.make("lead"),
        peerThreadId: ThreadId.make("peer"),
      };
      const activeLead = {
        ...thread("lead"),
        pairSession,
        pairState: { pendingTurnMessageId: null, pendingPeerMessageIds: [] },
        session: {
          threadId: ThreadId.make("lead"),
          status: "running" as const,
          providerName: "codex",
          runtimeMode: "full-access" as const,
          activeTurnId: null,
          lastError: null,
          updatedAt: CREATED_AT,
        },
      };
      const exit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.end",
            commandId: CommandId.make("pair-end-active"),
            threadId: ThreadId.make("lead"),
            createdAt: CREATED_AT,
          },
          readModel: readModel([
            activeLead,
            {
              ...thread("peer"),
              pairSession,
              pairState: { pendingTurnMessageId: null, pendingPeerMessageIds: [] },
            },
          ]),
        }),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("Interrupt or wait for both agents");
      }
    }),
  );

  it.effect("rejects checkpoint revert and archive while Pair is active", () =>
    Effect.gen(function* () {
      const pairSession = {
        id: "pair-1",
        leadThreadId: ThreadId.make("lead"),
        peerThreadId: ThreadId.make("peer"),
      };
      const model = readModel([
        { ...thread("lead"), pairSession },
        { ...thread("peer"), pairSession },
      ]);
      const revertExit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.checkpoint.revert",
            commandId: CommandId.make("pair-revert"),
            threadId: ThreadId.make("lead"),
            turnCount: 0,
            createdAt: CREATED_AT,
          },
          readModel: model,
        }),
      );
      const archiveExit = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.archive",
            commandId: CommandId.make("pair-archive"),
            threadId: ThreadId.make("lead"),
          },
          readModel: model,
        }),
      );
      expect(revertExit._tag).toBe("Failure");
      expect(archiveExit._tag).toBe("Failure");
    }),
  );

  it.effect("keeps Pair linked until a completed Peer message is delivered and adopted", () =>
    Effect.gen(function* () {
      const pairSession = {
        id: "pair-1",
        leadThreadId: ThreadId.make("lead"),
        peerThreadId: ThreadId.make("peer"),
      };
      let model = readModel([
        {
          ...thread("lead"),
          pairSession,
          pairState: { pendingTurnMessageId: null, pendingPeerMessageIds: [] },
        },
        {
          ...thread("peer"),
          pairSession,
          pairState: { pendingTurnMessageId: null, pendingPeerMessageIds: [] },
        },
      ]);
      const sourceMessageId = MessageId.make("assistant-source");
      model = yield* projectEvent(model, {
        sequence: 1,
        eventId: EventId.make("assistant-delta"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("lead"),
        occurredAt: CREATED_AT,
        commandId: CommandId.make("assistant-delta"),
        causationEventId: null,
        correlationId: CommandId.make("assistant-delta"),
        metadata: {},
        type: "thread.message-sent",
        payload: {
          threadId: ThreadId.make("lead"),
          messageId: sourceMessageId,
          role: "assistant",
          text: "<peer_message>Review this.</peer_message>",
          pairSessionId: "pair-1",
          turnId: null,
          streaming: true,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      });
      model = yield* projectEvent(model, {
        sequence: 2,
        eventId: EventId.make("assistant-complete"),
        aggregateKind: "thread",
        aggregateId: ThreadId.make("lead"),
        occurredAt: CREATED_AT,
        commandId: CommandId.make("assistant-complete"),
        causationEventId: null,
        correlationId: CommandId.make("assistant-complete"),
        metadata: {},
        type: "thread.message-sent",
        payload: {
          threadId: ThreadId.make("lead"),
          messageId: sourceMessageId,
          role: "assistant",
          text: "",
          pairSessionId: "pair-1",
          turnId: null,
          streaming: false,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      });
      expect(model.threads[0]?.pairState?.pendingPeerMessageIds).toEqual([
        "pair-1:assistant-source:0",
      ]);

      const racedEnd = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.end",
            commandId: CommandId.make("end-before-forward"),
            threadId: ThreadId.make("lead"),
            createdAt: CREATED_AT,
          },
          readModel: model,
        }),
      );
      expect(racedEnd._tag).toBe("Failure");

      const forward = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.message.forward",
          commandId: CommandId.make("forward-peer-message"),
          threadId: ThreadId.make("lead"),
          pairSessionId: "pair-1",
          pairMessageId: "pair-1:assistant-source:0",
          senderMessageId: MessageId.make("peer-sender"),
          receiverMessageId: MessageId.make("peer-receiver"),
          text: "Review this.",
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      for (const [index, event] of (Array.isArray(forward) ? forward : [forward]).entries()) {
        model = yield* projectEvent(model, { ...event, sequence: 3 + index });
      }
      expect(model.threads[0]?.pairState?.pendingPeerMessageIds).toEqual([]);
      expect(model.threads[1]?.pairState?.pendingTurnMessageId).toBe("peer-receiver");

      const endBeforeAdoption = yield* Effect.exit(
        decideOrchestrationCommand({
          command: {
            type: "thread.pair.end",
            commandId: CommandId.make("end-before-adoption"),
            threadId: ThreadId.make("lead"),
            createdAt: CREATED_AT,
          },
          readModel: model,
        }),
      );
      expect(endBeforeAdoption._tag).toBe("Failure");

      const peerReady = yield* decideOrchestrationCommand({
        command: {
          type: "thread.session.set",
          commandId: CommandId.make("peer-turn-handled"),
          threadId: ThreadId.make("peer"),
          session: {
            threadId: ThreadId.make("peer"),
            status: "ready",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: CREATED_AT,
          },
          turnStartMessageId: MessageId.make("peer-receiver"),
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      const readyEvent = Array.isArray(peerReady) ? peerReady.at(-1) : peerReady;
      if (readyEvent) model = yield* projectEvent(model, { ...readyEvent, sequence: 10 });

      const end = yield* decideOrchestrationCommand({
        command: {
          type: "thread.pair.end",
          commandId: CommandId.make("end-after-delivery"),
          threadId: ThreadId.make("lead"),
          createdAt: CREATED_AT,
        },
        readModel: model,
      });
      expect(Array.isArray(end) ? end : [end]).toHaveLength(2);
    }),
  );
});
