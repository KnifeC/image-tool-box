import { describe, expect, it } from "vitest";
import {
  getClipboardImageFiles,
  toOpenedClipboardImages,
} from "../clipboard";

function namedBlob(name: string, type: string) {
  const blob = new Blob(["image-bytes"], { type }) as File;
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

describe("clipboard image import", () => {
  it("extracts image items and ignores clipboard text", () => {
    const image = namedBlob("clipboard.png", "image/png");
    const clipboardData = {
      items: [
        {
          kind: "string",
          type: "text/plain",
          getAsFile: () => null,
        },
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => image,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    expect(getClipboardImageFiles(clipboardData)).toEqual([image]);
  });

  it("converts pasted files to the existing platform import format", async () => {
    const image = namedBlob("screenshot.webp", "image/webp");

    const [openedFile] = await toOpenedClipboardImages([image]);

    expect(openedFile).toEqual({
      name: "screenshot.webp",
      mimeType: "image/webp",
      bytes: expect.any(ArrayBuffer),
    });
  });
});
