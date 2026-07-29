import { describe, expect, it } from "vitest";
import {
  cloneDocument,
  createDocument,
  HistoryStack,
  SnapshotCommand,
} from "../src";

describe("HistoryStack", () => {
  it("undoes and redoes a document snapshot", () => {
    const document = createDocument();
    const before = cloneDocument(document);
    document.canvas.width = 1920;
    const after = cloneDocument(document);
    const history = new HistoryStack();
    history.commit(new SnapshotCommand("canvas", before, after));

    expect(history.undo(document)).toBe(true);
    expect(document.canvas.width).toBe(1080);
    expect(history.redo(document)).toBe(true);
    expect(document.canvas.width).toBe(1920);
  });
});

