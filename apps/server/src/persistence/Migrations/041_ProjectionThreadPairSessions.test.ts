import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("041_ProjectionThreadPairSessions", (it) => {
  it.effect("adds nullable Pair Session and Peer message metadata", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* runMigrations({ toMigrationInclusive: 41 });

      const threadColumns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      const messageColumns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_thread_messages)
      `;
      const turnColumns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_turns)
      `;
      const turnIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_turns)
      `;
      const pairSession = threadColumns.find((column) => column.name === "pair_session_json");
      const pairState = threadColumns.find((column) => column.name === "pair_state_json");
      const peerMessage = messageColumns.find((column) => column.name === "peer_message_json");
      const messagePairSession = messageColumns.find((column) => column.name === "pair_session_id");
      const turnPairSession = turnColumns.find((column) => column.name === "pair_session_id");
      assert.equal(pairSession?.notnull, 0);
      assert.equal(pairState?.notnull, 0);
      assert.equal(peerMessage?.notnull, 0);
      assert.equal(messagePairSession?.notnull, 0);
      assert.equal(turnPairSession?.notnull, 0);
      assert.isTrue(
        turnIndexes.some((index) => index.name === "idx_projection_turns_pending_pair"),
      );
    }),
  );
});
