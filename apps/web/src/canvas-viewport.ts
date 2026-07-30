export interface ViewportPoint {
  x: number;
  y: number;
}

interface PinchViewportInput {
  zoom: number;
  layerPosition: ViewportPoint;
  fitOrigin: ViewportPoint;
  previousCenter: ViewportPoint;
  currentCenter: ViewportPoint;
  scaleFactor: number;
  minZoom: number;
  maxZoom: number;
}

export function calculatePinchViewport({
  zoom,
  layerPosition,
  fitOrigin,
  previousCenter,
  currentCenter,
  scaleFactor,
  minZoom,
  maxZoom,
}: PinchViewportInput) {
  const nextZoom = Math.max(
    minZoom,
    Math.min(maxZoom, zoom * scaleFactor),
  );
  const documentPoint = {
    x: (previousCenter.x - layerPosition.x) / zoom,
    y: (previousCenter.y - layerPosition.y) / zoom,
  };
  const nextLayerPosition = {
    x: currentCenter.x - documentPoint.x * nextZoom,
    y: currentCenter.y - documentPoint.y * nextZoom,
  };

  return {
    zoom: nextZoom,
    viewOffset: {
      x: nextLayerPosition.x - fitOrigin.x,
      y: nextLayerPosition.y - fitOrigin.y,
    },
  };
}
