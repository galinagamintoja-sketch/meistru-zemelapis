const LITHUANIA_CENTER = { lat: 55.1694, lng: 23.8813 };

const cityCoordinateMap: Record<string, { lat: number; lng: number }> = {
  alytus: { lat: 54.3964, lng: 24.0456 },
  kaunas: { lat: 54.8985, lng: 23.9036 },
  klaipeda: { lat: 55.7033, lng: 21.1443 },
  lentvaris: { lat: 54.6436, lng: 25.0486 },
  marijampole: { lat: 54.5599, lng: 23.3541 },
  panevezys: { lat: 55.7348, lng: 24.3575 },
  siauliai: { lat: 55.9349, lng: 23.3137 },
  taurage: { lat: 55.2522, lng: 22.2897 },
  telsiai: { lat: 55.9814, lng: 22.2472 },
  utena: { lat: 55.4976, lng: 25.5992 },
  vilnius: { lat: 54.6872, lng: 25.2797 }
};

export function cityCoordinates(city: string | null | undefined) {
  if (!city) {
    return null;
  }

  return cityCoordinateMap[normalizeCityKey(city)] ?? null;
}

export async function resolveCityCoordinates(city: string | null | undefined) {
  const knownCoordinates = cityCoordinates(city);
  if (knownCoordinates || !city?.trim()) {
    return knownCoordinates;
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "lt",
    q: `${city.trim()}, Lithuania`
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        accept: "application/json",
        "user-agent": "LocalPro.lt registration geocoder"
      }
    });

    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);

    if (!isLithuaniaCoordinate(lat, lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

export function profileCoordinates(latitude: number | null | undefined, longitude: number | null | undefined, cities: string[]) {
  if (typeof latitude === "number" && typeof longitude === "number") {
    return { lat: latitude, lng: longitude };
  }

  for (const city of cities) {
    const coordinates = cityCoordinates(city);
    if (coordinates) {
      return coordinates;
    }
  }

  return LITHUANIA_CENTER;
}

export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function approximatePublicCoordinates(id: string, coordinates: { lat: number; lng: number }) {
  const hash = Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = (hash % 360) * (Math.PI / 180);
  const offsetKm = 0.35 + (hash % 7) * 0.08;

  return {
    lat: coordinates.lat + (Math.cos(angle) * offsetKm) / 111,
    lng: coordinates.lng + (Math.sin(angle) * offsetKm) / (111 * Math.cos(toRadians(coordinates.lat)))
  };
}

export function isNationwideTravelRange(value: number | string | null | undefined) {
  return String(value ?? "").toLowerCase() === "lt" || Number(value) >= 150;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function isLithuaniaCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 53.8 && lat <= 56.5 && lng >= 20.5 && lng <= 27;
}

function normalizeCityKey(city: string) {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ė", "e")
    .replaceAll("š", "s")
    .replaceAll("ž", "z");
}
