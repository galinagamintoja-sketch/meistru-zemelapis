import { describe, expect, it, vi } from "vitest";
import {
  addressNoResultsLabel,
  manualAddressValue,
  normalizePlacesSuggestion,
  resolvePlacesSuggestionSelection,
  shouldRequestAddressSuggestions
} from "../components/AddressAutocomplete";

class ClassLikeAutocompleteSuggestion {
  #prediction: ClassLikePlacePrediction;

  constructor(prediction: ClassLikePlacePrediction) {
    this.#prediction = prediction;
  }

  get placePrediction() {
    return this.#prediction;
  }
}

class ClassLikePlacePrediction {
  placeId = "google-place-123";
  text = {
    toString: () => "Trakų g. 10, Lentvaris, Trakai District Municipality, Lithuania"
  };
  private readonly fetchFieldsMock = vi.fn(async () => undefined);

  toPlace() {
    return {
      id: "google-place-123",
      formattedAddress: "Trakų g. 10, Lentvaris, Trakai District Municipality, Lithuania",
      location: {
        lat: () => 54.6376,
        lng: () => 25.0512
      },
      fetchFields: this.fetchFieldsMock
    };
  }

  get fetchFields() {
    return this.fetchFieldsMock;
  }
}

describe("Google Places autocomplete helpers", () => {
  it("starts after three characters and keeps manual entry as a private fallback", () => {
    expect(shouldRequestAddressSuggestions("Tr", "")).toBe(false);
    expect(shouldRequestAddressSuggestions("Tra", "")).toBe(true);
    expect(shouldRequestAddressSuggestions("Trakai", "selected-place")).toBe(false);
    expect(addressNoResultsLabel).toBe("Adresų nerasta");
    expect(manualAddressValue({
      address: "Old",
      placeId: "selected-place",
      latitude: 54.6,
      longitude: 25.0,
      town: "Trakai"
    }, "Rankinis adresas")).toEqual({
      address: "Rankinis adresas",
      placeId: "",
      latitude: null,
      longitude: null,
      town: "",
      street: "",
      postcode: ""
    });
  });

  it("normalizes suggestions returned from a Google class-like object without spreading away placePrediction", () => {
    const prediction = new ClassLikePlacePrediction();
    const googleSuggestion = new ClassLikeAutocompleteSuggestion(prediction);

    expect({ ...googleSuggestion }).toEqual({});

    const normalized = normalizePlacesSuggestion(googleSuggestion);

    expect(normalized).toEqual({
      id: "google-place-123",
      label: "Trakų g. 10, Lentvaris, Trakai District Municipality, Lithuania",
      placePrediction: prediction
    });
    expect(normalized?.placePrediction).toBe(prediction);
  });

  it("selecting a suggestion calls toPlace and fetchFields, then stores address, place ID and coordinates", async () => {
    const prediction = new ClassLikePlacePrediction();
    const normalized = normalizePlacesSuggestion(new ClassLikeAutocompleteSuggestion(prediction));

    expect(normalized).not.toBeNull();
    const selected = await resolvePlacesSuggestionSelection(normalized!);

    expect(prediction.fetchFields).toHaveBeenCalledWith({ fields: ["formattedAddress", "id", "location"] });
    expect(selected).toMatchObject({
      address: "Trakų g. 10, Lentvaris, Trakai District Municipality, Lithuania",
      placeId: "google-place-123",
      latitude: 54.6376,
      longitude: 25.0512
    });
  });
});
