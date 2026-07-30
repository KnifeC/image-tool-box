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
let autosaveCallback: (() => void) | undefined;

beforeEach(() => {
  storage = new MemoryStorage();
  autosaveCallback = undefined;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      setTimeout: vi.fn((handler: TimerHandler, delay?: number) => {
        if (typeof handler === "function" && delay === 1_000) {
          autosaveCallback = () => handler();
        }
        return 1;
      }),
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
  it("autosaves, restores, and replaces the last local project", async () => {
    const store = useEditorStore();
    const previousProjectId = store.document.id;
    store.addNode("rectangle");

    expect(store.hasPendingAutosave).toBe(true);
    expect(autosaveCallback).toBeTypeOf("function");
    autosaveCallback?.();
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
