import { describe, expect, it } from "vitest";
import { createDocument } from "@imagetoolbox/editor-core";

describe("web editor bootstrap", () => {
  it("creates a portable versioned document", () => {
    const document = createDocument();
    expect(document.version).toBe(1);
    expect(document.canvas).toEqual(
      expect.objectContaining({ width: 1080, height: 1080 }),
    );
  });
});
