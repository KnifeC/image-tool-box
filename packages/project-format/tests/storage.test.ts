import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDocument } from "@imagetoolbox/editor-core";
import {
  deleteLocalProject,
  loadLocalProject,
  saveLocalProject,
} from "../src/index";

describe("local project storage", () => {
  it("round-trips project assets and removes the complete local project", async () => {
    const document = createDocument("Local draft");
    const assetId = "asset_test";
    const blob = new Blob(["image-bytes"], { type: "image/png" });
    document.assets.push({
      id: assetId,
      type: "image",
      name: "test.png",
      mimeType: "image/png",
      width: 10,
      height: 10,
      size: blob.size,
      storageKey: assetId,
    });

    await saveLocalProject(document, new Map([[assetId, blob]]));

    const restored = await loadLocalProject(document.id);
    expect(restored?.document.name).toBe("Local draft");
    expect(await restored?.assets.get(assetId)?.text()).toBe("image-bytes");

    await deleteLocalProject(document.id);

    expect(await loadLocalProject(document.id)).toBeNull();
  });

  it("removes blobs that are no longer referenced by the project", async () => {
    const document = createDocument("Asset cleanup");
    const assetId = "asset_stale";
    const blob = new Blob(["stale"], { type: "image/png" });
    document.assets.push({
      id: assetId,
      type: "image",
      name: "stale.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      size: blob.size,
      storageKey: assetId,
    });
    await saveLocalProject(document, new Map([[assetId, blob]]));

    document.assets = [];
    await saveLocalProject(document, new Map());

    const restored = await loadLocalProject(document.id);
    expect(restored?.assets.size).toBe(0);
    await deleteLocalProject(document.id);
  });
});
