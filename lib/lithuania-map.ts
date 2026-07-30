export const LITHUANIA_BOUNDS: [[number, number], [number, number]] = [
  [53.8, 20.5],
  [56.5, 27]
];

type Point = { lat: number; lng: number };

type BoundsZoomMap = {
  getBoundsZoom: (bounds: [[number, number], [number, number]], inside?: boolean) => number;
  getMaxZoom: () => number;
};

export function isInsideLithuania(point: Point) {
  return point.lat >= LITHUANIA_BOUNDS[0][0]
    && point.lat <= LITHUANIA_BOUNDS[1][0]
    && point.lng >= LITHUANIA_BOUNDS[0][1]
    && point.lng <= LITHUANIA_BOUNDS[1][1];
}

export function clampToLithuania(point: Point): Point {
  return {
    lat: Math.min(LITHUANIA_BOUNDS[1][0], Math.max(LITHUANIA_BOUNDS[0][0], point.lat)),
    lng: Math.min(LITHUANIA_BOUNDS[1][1], Math.max(LITHUANIA_BOUNDS[0][1], point.lng))
  };
}

export function getResponsiveLithuaniaMinZoom(map: BoundsZoomMap) {
  const containerInsideBoundsZoom = map.getBoundsZoom(LITHUANIA_BOUNDS, true);
  return Math.min(map.getMaxZoom(), Math.max(0, containerInsideBoundsZoom));
}
