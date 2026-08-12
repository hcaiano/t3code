import { CommandId, MessageId, type OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { forkParked } from "../../serverActivation.ts";
import { ProjectionThreadMessageRepository } from "../../persistence/Services/ProjectionThreadMessages.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  PairMessageReactor,
  type PairMessageReactorShape,
} from "../Services/PairMessageReactor.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { extractPeerMessages } from "../pairMessages.ts";

type CompletedAssistantMessageEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;
interface PairMessageCandidate {
  readonly threadId: CompletedAssistantMessageEvent["payload"]["threadId"];
  readonly messageId: CompletedAssistantMessageEvent["payload"]["messageId"];
  readonly pendingPairMessageIds?: ReadonlySet<string>;
}

export { extractPeerMessages } from "../pairMessages.ts";

function sourceMessageIdFromPendingPeerMessageId(
  pairSessionId: string,
  pairMessageId: string,
): MessageId | undefined {
  const prefix = `${pairSessionId}:`;
  const indexSeparator = pairMessageId.lastIndexOf(":");
  if (
    !pairMessageId.startsWith(prefix) ||
    indexSeparator <= prefix.length ||
    !/^\d+$/.test(pairMessageId.slice(indexSeparator + 1))
  ) {
    return undefined;
  }
  return MessageId.make(pairMessageId.slice(prefix.length, indexSeparator));
}

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const projectionThreadMessages = yield* ProjectionThreadMessageRepository;

  const processCandidate = Effect.fn("PairMessageReactor.processCandidate")(function* (
    input: PairMessageCandidate,
  ) {
    const sourceMessageOption = yield* projectionThreadMessages.getByMessageId({
      messageId: input.messageId,
    });
    if (Option.isNone(sourceMessageOption)) return;
    const sourceMessage = sourceMessageOption.value;
    if (
      sourceMessage.role !== "assistant" ||
      sourceMessage.threadId !== input.threadId ||
      sourceMessage.isStreaming ||
      sourceMessage.peerMessage !== undefined ||
      sourceMessage.pairSessionId == null
    ) {
      return;
    }
    const threadOption = yield* projectionSnapshotQuery.getThreadShellById(sourceMessage.threadId);
    if (Option.isNone(threadOption)) return;
    const thread = threadOption.value;
    const pairSession = thread.pairSession;
    if (pairSession == null || pairSession.id !== sourceMessage.pairSessionId) return;
    if (
      sourceMessage.threadId !== pairSession.leadThreadId &&
      sourceMessage.threadId !== pairSession.peerThreadId
    ) {
      return;
    }

    const messages = extractPeerMessages(sourceMessage.text);
    yield* Effect.forEach(
      messages,
      (text, index) => {
        const pairMessageId = `${pairSession.id}:${sourceMessage.messageId}:${index}`;
        if (
          input.pendingPairMessageIds !== undefined &&
          !input.pendingPairMessageIds.has(pairMessageId)
        ) {
          return Effect.void;
        }
        return orchestrationEngine.dispatch({
          type: "thread.pair.message.forward",
          commandId: CommandId.make(`pair-message:${pairMessageId}`),
          threadId: thread.id,
          pairSessionId: pairSession.id,
          pairMessageId,
          senderMessageId: MessageId.make(`pair-message:${pairMessageId}:sender`),
          receiverMessageId: MessageId.make(`pair-message:${pairMessageId}:receiver`),
          text,
          createdAt: sourceMessage.updatedAt,
        });
      },
      { concurrency: 1, discard: true },
    );
  });

  const processCandidateSafely = (candidate: PairMessageCandidate) =>
    processCandidate(candidate).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        return Effect.logDebug("pair message reactor skipped an event", {
          threadId: candidate.threadId,
          messageId: candidate.messageId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processCandidateSafely);
  const start: PairMessageReactorShape["start"] = Effect.fn("PairMessageReactor.start")(
    function* () {
      yield* forkParked(
        Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
          if (
            event.type !== "thread.message-sent" ||
            event.payload.role !== "assistant" ||
            event.payload.streaming
          ) {
            return Effect.void;
          }
          return worker.enqueue({
            threadId: event.payload.threadId,
            messageId: event.payload.messageId,
          });
        }),
      );

      const reconcile = Effect.gen(function* () {
        const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
        const pendingBySource = new Map<
          string,
          {
            readonly threadId: PairMessageCandidate["threadId"];
            readonly messageId: PairMessageCandidate["messageId"];
            readonly pairMessageIds: Set<string>;
          }
        >();
        for (const thread of readModel.threads) {
          if (thread.deletedAt !== null || thread.pairSession == null || thread.pairState == null) {
            continue;
          }
          for (const pairMessageId of thread.pairState.pendingPeerMessageIds) {
            const messageId = sourceMessageIdFromPendingPeerMessageId(
              thread.pairSession.id,
              pairMessageId,
            );
            if (messageId === undefined) continue;
            const key = `${thread.id}\0${messageId}`;
            const pending = pendingBySource.get(key) ?? {
              threadId: thread.id,
              messageId,
              pairMessageIds: new Set<string>(),
            };
            pending.pairMessageIds.add(pairMessageId);
            pendingBySource.set(key, pending);
          }
        }
        yield* Effect.forEach(
          pendingBySource.values(),
          (pending) =>
            worker.enqueue({
              threadId: pending.threadId,
              messageId: pending.messageId,
              pendingPairMessageIds: pending.pairMessageIds,
            }),
          { concurrency: 1, discard: true },
        );
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("pair message catch-up failed", { cause: Cause.pretty(cause) }),
        ),
      );
      yield* reconcile;
    },
  );

  return {
    start,
    drain: worker.drain,
  } satisfies PairMessageReactorShape;
});

export const PairMessageReactorLive = Layer.effect(PairMessageReactor, make);
