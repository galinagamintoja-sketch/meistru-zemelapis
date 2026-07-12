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
