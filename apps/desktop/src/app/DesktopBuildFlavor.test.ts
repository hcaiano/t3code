import { assert, describe, it } from "@effect/vitest";

import { readDesktopBuildFlavor, resolveDesktopBuildFlavor } from "./DesktopBuildFlavor.ts";

describe("DesktopBuildFlavor", () => {
  it("reads the Pair flavor from staged package metadata", () => {
    assert.equal(
      readDesktopBuildFlavor(
        "/staged/app",
        (path) => {
          assert.equal(path, "/staged/app/package.json");
          return JSON.stringify({ t3codeDesktopFlavor: "pair" });
        },
        (...parts) => parts.join("/"),
      ),
      "pair",
    );
  });

  it("keeps missing, invalid, and unknown metadata on the official flavor", () => {
    assert.equal(resolveDesktopBuildFlavor(undefined), "official");
    assert.equal(resolveDesktopBuildFlavor("unknown"), "official");
    assert.equal(
      readDesktopBuildFlavor(
        "/app",
        () => {
          throw new Error("missing");
        },
        (...parts) => parts.join("/"),
      ),
      "official",
    );
  });
});
