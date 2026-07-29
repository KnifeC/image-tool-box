import { getNodeBounds, type ImageToolBoxDocument, type SceneNode } from "@imagetoolbox/editor-core";

export async function renderDocument(
  document: ImageToolBoxDocument,
  assets: Map<string, Blob>,
  options: {
    format: "image/png" | "image/jpeg" | "image/webp";
    quality: number;
    scale: number;
    selectionOnly: boolean;
    selectedIds: string[];
  },
) {
  const targetNodes = options.selectionOnly
    ? document.nodes.filter((node) => options.selectedIds.includes(node.id))
    : document.nodes;
  const bounds =
    options.selectionOnly && targetNodes.length
      ? getNodeBounds(targetNodes)!
      : { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * options.scale));
  canvas.height = Math.max(1, Math.round(bounds.height * options.scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.scale(options.scale, options.scale);
  context.translate(-bounds.x, -bounds.y);
  if (
    document.canvas.background.type === "color" ||
    options.format === "image/jpeg"
  ) {
    context.fillStyle =
      document.canvas.background.type === "color"
        ? document.canvas.background.color
        : "#ffffff";
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  const imageCache = new Map<string, ImageBitmap>();
  try {
    for (const node of [...targetNodes].sort((a, b) => a.zIndex - b.zIndex)) {
      if (!node.visible) continue;
      await renderNode(context, node, document, assets, imageCache);
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
        options.format,
        options.quality,
      ),
    );
  } finally {
    for (const bitmap of imageCache.values()) bitmap.close();
  }
}

async function renderNode(
  context: CanvasRenderingContext2D,
  node: SceneNode,
  document: ImageToolBoxDocument,
  assets: Map<string, Blob>,
  imageCache: Map<string, ImageBitmap>,
) {
  context.save();
  context.globalAlpha = node.opacity;
  context.translate(node.x + node.width / 2, node.y + node.height / 2);
  context.rotate((node.rotation * Math.PI) / 180);
  context.translate(-node.width / 2, -node.height / 2);

  if (node.type === "image") {
    let bitmap = imageCache.get(node.assetId);
    if (!bitmap) {
      const blob = assets.get(node.assetId);
      if (!blob) return context.restore();
      bitmap = await createImageBitmap(blob);
      imageCache.set(node.assetId, bitmap);
    }
    context.save();
    if (node.cornerRadius > 0) {
      roundedRect(context, 0, 0, node.width, node.height, node.cornerRadius);
      context.clip();
    }
    context.translate(node.flipX ? node.width : 0, node.flipY ? node.height : 0);
    context.scale(node.flipX ? -1 : 1, node.flipY ? -1 : 1);
    context.drawImage(
      bitmap,
      node.cropRect.x,
      node.cropRect.y,
      node.cropRect.width,
      node.cropRect.height,
      0,
      0,
      node.width,
      node.height,
    );
    context.restore();
    if (node.border.enabled) {
      context.strokeStyle = node.border.color;
      context.lineWidth = node.border.width;
      context.setLineDash(node.border.style === "dashed" ? [10, 8] : []);
      roundedRect(context, 0, 0, node.width, node.height, node.cornerRadius);
      context.stroke();
    }
  } else if (node.type === "rectangle" || node.type === "ellipse") {
    context.beginPath();
    if (node.type === "rectangle") {
      roundedRect(context, 0, 0, node.width, node.height, node.cornerRadius);
    } else {
      context.ellipse(
        node.width / 2,
        node.height / 2,
        node.width / 2,
        node.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    }
    if (node.style.fill.enabled) {
      const alpha = context.globalAlpha;
      context.globalAlpha = alpha * node.style.fill.opacity;
      context.fillStyle = node.style.fill.color;
      context.fill();
      context.globalAlpha = alpha;
    }
    if (node.style.stroke.enabled) {
      context.strokeStyle = node.style.stroke.color;
      context.lineWidth = node.style.stroke.width;
      context.setLineDash(node.style.stroke.style === "dashed" ? [10, 8] : []);
      context.stroke();
    }
  } else if (node.type === "line" || node.type === "arrow") {
    const points = node.points;
    context.strokeStyle = node.stroke.color;
    context.fillStyle = node.stroke.color;
    context.lineWidth = node.stroke.width;
    context.lineCap = "round";
    context.setLineDash(node.stroke.style === "dashed" ? [10, 8] : []);
    context.beginPath();
    context.moveTo(points[0] ?? 0, points[1] ?? 0);
    context.lineTo(points[2] ?? node.width, points[3] ?? node.height);
    context.stroke();
    if (node.type === "arrow" && node.arrowEnd) {
      drawArrowHead(
        context,
        points[0] ?? 0,
        points[1] ?? 0,
        points[2] ?? node.width,
        points[3] ?? node.height,
        node.pointerLength,
      );
    }
  } else if (node.type === "text") {
    if (node.background.enabled) {
      context.globalAlpha *= node.background.opacity;
      context.fillStyle = node.background.color;
      roundedRect(
        context,
        -node.background.padding,
        -node.background.padding,
        node.width + node.background.padding * 2,
        node.height + node.background.padding * 2,
        node.background.cornerRadius,
      );
      context.fill();
      context.globalAlpha = node.opacity;
    }
    context.fillStyle = node.color;
    context.font = `${node.fontStyle} ${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`;
    context.textAlign = node.align;
    context.textBaseline = "top";
    const x = node.align === "center" ? node.width / 2 : node.align === "right" ? node.width : 0;
    context.fillText(node.text, x, 0, node.width);
  } else if (node.type === "freehand") {
    context.strokeStyle = node.color;
    context.lineWidth = node.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    for (let index = 0; index < node.points.length; index += 2) {
      const x = node.points[index] ?? 0;
      const y = node.points[index + 1] ?? 0;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, r);
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  length: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - length * Math.cos(angle - Math.PI / 6), toY - length * Math.sin(angle - Math.PI / 6));
  context.lineTo(toX - length * Math.cos(angle + Math.PI / 6), toY - length * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

