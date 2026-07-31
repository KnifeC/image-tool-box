import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_API_VERSION,
  type ImageToolBoxPlatform,
} from "@imagetoolbox/platform-api";
import { resolvePlatform } from "../platform";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("platform resolution", () => {
  it("uses the Web implementation when no host platform is exposed", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const platform = resolvePlatform();

    expect(platform.apiVersion).toBe(PLATFORM_API_VERSION);
    expect(platform.capabilities.nativeFileDialogs).toBe(false);
    expect(platform.writeImageToClipboard).toBeTypeOf("function");
    expect(platform.onMenuCommand(vi.fn())).toBeTypeOf("function");
  });

  it("returns the host implementation through the same API", () => {
    const hostPlatform: ImageToolBoxPlatform = {
      apiVersion: PLATFORM_API_VERSION,
      capabilities: {
        nativeFileDialogs: true,
        directFileWrite: true,
        desktopMenu: true,
        folderAccess: false,
        nativeImageCodec: false,
        backgroundTasks: false,
        largeImageMode: false,
        openOutputDirectory: false,
      },
      openFiles: vi.fn().mockResolvedValue([]),
      saveFile: vi.fn().mockResolvedValue({ saved: true }),
      writeImageToClipboard: vi.fn().mockResolvedValue(undefined),
      setLocale: vi.fn().mockResolvedValue(undefined),
      onMenuCommand: vi.fn().mockReturnValue(() => {}),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { imageToolBoxPlatform: hostPlatform },
    });

    expect(resolvePlatform()).toBe(hostPlatform);
  });
});
