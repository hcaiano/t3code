import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!threadColumns.some((column) => column.name === "pair_session_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pair_session_json TEXT
    `;
  }
  if (!threadColumns.some((column) => column.name === "pair_state_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pair_state_json TEXT
    `;
  }

  const messageColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `;
  if (!messageColumns.some((column) => column.name === "peer_message_json")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      ADD COLUMN peer_message_json TEXT
    `;
  }
  if (!messageColumns.some((column) => column.name === "pair_session_id")) {
    yield* sql`
      ALTER TABLE projection_thread_messages
      ADD COLUMN pair_session_id TEXT
    `;
  }
  const turnColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_turns)
  `;
  if (!turnColumns.some((column) => column.name === "pair_session_id")) {
    yield* sql`
      ALTER TABLE projection_turns
      ADD COLUMN pair_session_id TEXT
    `;
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_turns_pending_pair
    ON projection_turns(pair_session_id, requested_at, thread_id)
    WHERE pair_session_id IS NOT NULL AND turn_id IS NULL AND state = 'pending'
  `;
});
