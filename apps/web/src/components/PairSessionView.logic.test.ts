import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { pairPaneClassName, resolvePairPane } from "./PairSessionView.logic";

describe("resolvePairPane", () => {
  const leadThreadId = ThreadId.make("lead-thread");
  const peerThreadId = ThreadId.make("peer-thread");
  const pairSession = { leadThreadId, peerThreadId };

  it("selects the pane for the routed pair thread", () => {
    expect(resolvePairPane(leadThreadId, pairSession)).toBe("lead");
    expect(resolvePairPane(peerThreadId, pairSession)).toBe("peer");
  });

  it("makes each desktop pane a bounded flex container", () => {
    expect(pairPaneClassName({ isWide: true, pane: "lead" }).split(" ")).toEqual(
      expect.arrayContaining(["flex", "min-h-0", "overflow-hidden"]),
    );
  });
});
