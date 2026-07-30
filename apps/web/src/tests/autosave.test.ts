import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { loadLocalProject } from "@imagetoolbox/project-format";
import { useEditorStore } from "../stores/editor";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

const originalWindow = globalThis.window;
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    },
  });
  setActivePinia(createPinia());
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("editor local draft lifecycle", () => {
  it("renames regular and background layers through undoable history", async () => {
    const store = useEditorStore();
    store.addNode("rectangle");
    const layer = store.document.nodes[0];
    expect(layer).toBeDefined();

    store.renameLayer(layer!.id, "  Hero image  ");
    expect(store.document.nodes.find(({ id }) => id === layer!.id)?.name).toBe(
      "Hero image",
    );

    store.undo();
    expect(store.document.nodes.find(({ id }) => id === layer!.id)?.name).toBe(
      "矩形 / Rectangle",
    );
    store.redo();
    expect(store.document.nodes.find(({ id }) => id === layer!.id)?.name).toBe(
      "Hero image",
    );

    const backgroundId = store.document.canvas.background.id;
    store.renameLayer(backgroundId, "Backdrop");
    expect(store.document.canvas.background.name).toBe("Backdrop");

    store.renameLayer(backgroundId, "   ");
    expect(store.document.canvas.background.name).toBe("Backdrop");
    await store.flushAutosave();
  });

  it("autosaves, restores, and replaces the last local project", async () => {
    const store = useEditorStore();
    const previousProjectId = store.document.id;
    store.addNode("rectangle");

    expect(store.hasPendingAutosave).toBe(true);
    expect(store.saving).toBe(true);
    await store.flushAutosave();

    expect(store.hasPendingAutosave).toBe(false);
    expect(storage.getItem("imagetoolbox.currentProjectId")).toBe(
      previousProjectId,
    );

    setActivePinia(createPinia());
    const restoredStore = useEditorStore();
    expect(await restoredStore.restoreLocalDraft()).toBe(true);
    expect(restoredStore.document.id).toBe(previousProjectId);
    expect(restoredStore.document.nodes).toHaveLength(1);

    await restoredStore.createNewProject();

    expect(restoredStore.document.id).not.toBe(previousProjectId);
    expect(restoredStore.hasProjectContent).toBe(false);
    expect(restoredStore.canUndo).toBe(false);
    expect(await loadLocalProject(previousProjectId)).toBeNull();
  });
});
