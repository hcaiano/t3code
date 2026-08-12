const PEER_MESSAGE_PATTERN = /<(t3_agent_message|peer_message)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;

export function extractPeerMessages(text: string): ReadonlyArray<string> {
  const messages: string[] = [];
  for (const match of text.matchAll(PEER_MESSAGE_PATTERN)) {
    const message = match[2]?.trim();
    if (message) messages.push(message);
  }
  return messages;
}

export function pairMessageIds(input: {
  readonly pairSessionId: string;
  readonly sourceMessageId: string;
  readonly text: string;
}): ReadonlyArray<string> {
  return extractPeerMessages(input.text).map(
    (_, index) => `${input.pairSessionId}:${input.sourceMessageId}:${index}`,
  );
}
