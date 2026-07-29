import type { ImageToolBoxDocument } from "@imagetoolbox/editor-core";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from "@zip.js/zip.js";
import { openDB, type DBSchema } from "idb";
import { z } from "zod";

const manifestSchema = z.object({
  format: z.literal("imagetoolbox-project"),
  version: z.literal(1),
  document: z.literal("document.json"),
  createdWith: z.string(),
});

type ProjectRecord = {
  document: ImageToolBoxDocument;
  thumbnail?: Blob;
  updatedAt: number;
};

interface ImageToolBoxDb extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
  };
  assets: {
    key: string;
    value: Blob;
  };
  settings: {
    key: string;
    value: unknown;
  };
}

const dbPromise =
  typeof indexedDB === "undefined"
    ? null
    : openDB<ImageToolBoxDb>("imagetoolbox", 1, {
        upgrade(db) {
          db.createObjectStore("projects");
          db.createObjectStore("assets");
          db.createObjectStore("settings");
        },
      });

export async function saveLocalProject(
  document: ImageToolBoxDocument,
  assets: Map<string, Blob>,
) {
  if (!dbPromise) return;
  const db = await dbPromise;
  const tx = db.transaction(["projects", "assets"], "readwrite");
  await tx.objectStore("projects").put(
    { document: structuredClone(document), updatedAt: Date.now() },
    document.id,
  );
  for (const [assetId, blob] of assets) {
    await tx.objectStore("assets").put(blob, `${document.id}:${assetId}`);
  }
  await tx.done;
}

export async function loadLocalProject(id: string) {
  if (!dbPromise) return null;
  const db = await dbPromise;
  const record = await db.get("projects", id);
  if (!record) return null;
  const assets = new Map<string, Blob>();
  for (const asset of record.document.assets) {
    const blob = await db.get("assets", `${id}:${asset.id}`);
    if (blob) assets.set(asset.id, blob);
  }
  return { document: record.document, assets };
}

export async function setSetting(key: string, value: unknown) {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.put("settings", value, key);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  if (!dbPromise) return undefined;
  const db = await dbPromise;
  return (await db.get("settings", key)) as T | undefined;
}

export async function exportProjectArchive(
  document: ImageToolBoxDocument,
  assets: Map<string, Blob>,
) {
  const writer = new ZipWriter(new BlobWriter("application/x-imagetoolbox-project"));
  await writer.add(
    "manifest.json",
    new TextReader(
      JSON.stringify({
        format: "imagetoolbox-project",
        version: 1,
        document: "document.json",
        createdWith: "ImageToolBox 0.1.0",
      }),
    ),
  );
  await writer.add("document.json", new TextReader(JSON.stringify(document)));
  for (const asset of document.assets) {
    const blob = assets.get(asset.id);
    if (!blob) throw new Error(`Missing asset: ${asset.id}`);
    const extension = extensionForMime(asset.mimeType);
    await writer.add(`assets/${asset.id}.${extension}`, new BlobReader(blob));
  }
  return writer.close();
}

export async function importProjectArchive(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();
  const safeEntries = entries.filter(
    (entry): entry is FileEntry =>
      !entry.directory &&
      !entry.filename.includes("..") &&
      !entry.filename.startsWith("/") &&
      !entry.filename.includes("\\"),
  );
  const manifestEntry = safeEntries.find((entry) => entry.filename === "manifest.json");
  const documentEntry = safeEntries.find((entry) => entry.filename === "document.json");
  if (!manifestEntry?.getData || !documentEntry?.getData) {
    await reader.close();
    throw new Error("Invalid ImageToolBox project");
  }
  const manifest = manifestSchema.parse(
    JSON.parse(await manifestEntry.getData(new TextWriter())),
  );
  if (manifest.version !== 1) throw new Error("Unsupported project version");
  const document = JSON.parse(
    await documentEntry.getData(new TextWriter()),
  ) as ImageToolBoxDocument;
  const assets = new Map<string, Blob>();
  for (const asset of document.assets) {
    const entry = safeEntries.find((candidate) =>
      candidate.filename.startsWith(`assets/${asset.id}.`),
    );
    if (!entry?.getData) throw new Error(`Missing asset: ${asset.name}`);
    assets.set(asset.id, await entry.getData(new BlobWriter(asset.mimeType)));
  }
  await reader.close();
  return { document, assets };
}

function extensionForMime(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("bmp")) return "bmp";
  return "jpg";
}
