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

  const request = (url: string, body: unknown) => fetcher(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const [servicesResponse, areaResponse] = await Promise.all([
    request("/api/meistras/services", { categoryIds: payload.categoryIds, subcategoryIds: payload.subcategoryIds }),
    request("/api/meistras/areas", payload.area)
  ]);
  const failed = !servicesResponse.ok ? await servicesResponse.json() : !areaResponse.ok ? await areaResponse.json() : null;
  return failed
    ? { ok: false as const, error: failed.error ?? "Išsaugoti nepavyko." }
    : { ok: true as const, message: "Paslaugos ir darbo zona išsaugotos." };
}
