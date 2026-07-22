import { describe, expect, it, vi } from "vitest";
import type { RegistrationDraft } from "../components/LocalProApp";
import { normalizeGooglePlacesCountryCode, submitRegistrationDraft, validateRegistrationDraftClient } from "../components/LocalProApp";

const baseDraft: RegistrationDraft = {
  name: "Test Meistras",
  phone: "+37061234567",
  email: "test@example.lt",
  address: "Traku g. 10, Lentvaris",
  placeId: "",
  latitude: null,
  longitude: null,
  city: "",
  town: "",
  street: "",
  postcode: "",
  houseNumber: "",
  trade: "",
  categorySlugs: ["apdaila"],
  subcategorySlugs: ["dazymas", "glaistymas", "grindys"],
  photoUrls: [" https://example.lt/photo.jpg "],
  photoUploads: [],
  description: "Testinis meistro profilio aprašymas, turintis daugiau nei aštuoniasdešimt simbolių patikimai publikavimo validacijai.",
  radiusKm: 25,
  travelRange: "25",
  operatingCities: [],
  consentAccepted: true,
  termsAccepted: true,
  privacyAcknowledged: true,
  publicContactConsent: true,
  marketingConsent: false,
  whatsappCommunicationConsent: false
};

function okResponse(id = "pending-profile") {
  return {
    ok: true,
    json: async () => ({ ok: true, profile: { id, approvalStatus: "pending", source: "self-registration" } })
  } as Response;
}

describe("registration submit address fallback", () => {
  it("blocks incomplete publication fields on the client", () => {
    expect(validateRegistrationDraftClient({ ...baseDraft, subcategorySlugs: ["dazymas"], description: "Per trumpas" })).toMatchObject({
      services: expect.any(String),
      description: expect.any(String)
    });
  });

  it("normalizes a 06 number before submission", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return okResponse();
    });
    await submitRegistrationDraft({ ...baseDraft, phone: "063601230" }, {
      selectedCategoryNames: ["Apdaila"],
      googlePlacesApiKeyConfigured: false,
      fetcher: fetcher as unknown as typeof fetch
    });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.phone).toBe("+37063601230");
  });

  it("uses LT when the country setting is missing or not a CLDR two-letter code", () => {
    expect(normalizeGooglePlacesCountryCode("LT")).toBe("LT");
    expect(normalizeGooglePlacesCountryCode("lt")).toBe("LT");
    expect(normalizeGooglePlacesCountryCode("not-a-country")).toBe("LT");
    expect(normalizeGooglePlacesCountryCode("AIzaSySecretLikeValue")).toBe("LT");
    expect(normalizeGooglePlacesCountryCode("")).toBe("LT");
  });

  it("submits resolved Google coordinates when address resolution succeeds", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return okResponse();
    });
    const geocode = vi.fn(async () => ({
      results: [
        {
          formatted_address: "Trakų g. 10, Lentvaris, Lithuania",
          geometry: {
            location: {
              lat: () => 54.6376,
              lng: () => 25.0512
            }
          }
        }
      ]
    }));

    const result = await submitRegistrationDraft(baseDraft, {
      selectedCategoryNames: ["Apdaila"],
      googlePlacesApiKeyConfigured: true,
      loadGooglePlacesScript: async () => undefined,
      getGoogleMaps: () => ({
        importLibrary: vi.fn(),
        Geocoder: class {
          geocode = geocode;
        }
      }),
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(result.usedManualFallback).toBe(false);
    expect(fetcher).toHaveBeenCalledWith("/api/tradesperson/register", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      address: "Trakų g. 10, Lentvaris, Lithuania",
      latitude: 54.6376,
      longitude: 25.0512,
      trade: "Apdaila",
      photoUrls: ["https://example.lt/photo.jpg"]
    });
  });

  it("submits the typed address with null coordinates when Google resolution fails", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return okResponse();
    });

    const result = await submitRegistrationDraft(baseDraft, {
      selectedCategoryNames: ["Apdaila"],
      googlePlacesApiKeyConfigured: true,
      loadGooglePlacesScript: async () => {
        throw new Error("RefererNotAllowedMapError");
      },
      getGoogleMaps: () => undefined,
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(result.usedManualFallback).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      address: "Traku g. 10, Lentvaris",
      latitude: null,
      longitude: null,
      trade: "Apdaila"
    });
  });

  it("times out Google address resolution and still submits the typed address", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return okResponse();
    });
    const never = new Promise<never>(() => undefined);
    const startedAt = Date.now();

    const result = await submitRegistrationDraft(baseDraft, {
      selectedCategoryNames: ["Apdaila"],
      googlePlacesApiKeyConfigured: true,
      timeoutMs: 15,
      loadGooglePlacesScript: async () => undefined,
      getGoogleMaps: () => ({
        importLibrary: vi.fn(),
        Geocoder: class {
          geocode = () => never;
        }
      }),
      fetcher: fetcher as unknown as typeof fetch
    });

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result.usedManualFallback).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.address).toBe("Traku g. 10, Lentvaris");
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });
});
