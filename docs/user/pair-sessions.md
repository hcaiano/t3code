# Pair Sessions

Pair Sessions connect two agent threads to the same project and worktree. Both agents can inspect
and edit the workspace. One thread is the Lead for user updates, but neither thread has extra file
permissions.

## Start a Pair Session

1. Open the thread that will be the Lead.
2. Select **Pair** in the chat header.
3. Select any configured provider and model for the second agent.
4. Select **Start pair**.

On a wide screen, T3 Code shows both chats side by side. On a narrow screen, use the **Lead** and
**Peer** tabs. You can send a message to either agent.

The agents exchange explicit Peer messages. T3 Code shows each message in both chats with its sender
and receiver. The Lead receives the existing task context first and sends a short summary to the new
Peer.

## End a Pair Session

Select **End pair** in the Lead chat header. This disconnects the threads but keeps both thread
histories. It does not delete either thread.

Checkpoint revert is not available while a Pair Session is active. A revert restores the shared
worktree, so a per-thread revert could remove changes made by the other agent. End the Pair Session
before you revert a thread.

## Current Limits

- Pair Sessions are available in the web client and the private desktop build.
- The official mobile client can show and control both normal threads, but it does not show the
  combined Pair layout.
- The private desktop build does not include T3 Connect, passkeys, or automatic updates.
- The two agents share one worktree. Normal Git and filesystem conflicts are possible if both agents
  edit the same file at the same time.
