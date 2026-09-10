type AreaPayload = {
  baseCity: FormDataEntryValue | null;
  registeredAddress: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: FormDataEntryValue | number | null;
};

type SavePayload = {
  categoryIds: string[];
  subcategoryIds: string[];
  area: AreaPayload;
};

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export async function saveServicesAndArea(fetcher: Fetcher, payload: SavePayload) {
  if (!payload.categoryIds.length) {
    return { ok: false as const, error: "Pasirinkite bent vieną darbo sritį prieš išsaugodami." };
  }

  const response = await fetcher("/api/meistras/services-and-area", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const failed = !response.ok ? await response.json().catch(() => ({})) : null;
  return failed
    ? { ok: false as const, error: failed.error ?? "Išsaugoti nepavyko." }
    : { ok: true as const, message: "Paslaugos ir darbo zona išsaugotos." };
}
