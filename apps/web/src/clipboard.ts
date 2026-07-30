import type { OpenedFile } from "@imagetoolbox/platform-api";

export function getClipboardImageFiles(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) return [];

  const itemFiles = [...clipboardData.items]
    .filter(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    )
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (itemFiles.length) return itemFiles;

  return [...clipboardData.files].filter((file) =>
    file.type.startsWith("image/"),
  );
}

export async function toOpenedClipboardImages(
  files: readonly File[],
): Promise<OpenedFile[]> {
  return Promise.all(
    files.map(async (file, index) => ({
      name: file.name || `pasted-image-${index + 1}.${extensionFor(file.type)}`,
      mimeType: file.type || "image/png",
      bytes: await file.arrayBuffer(),
    })),
  );
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/bmp") return "bmp";
  return "png";
}
