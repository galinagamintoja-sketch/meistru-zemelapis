"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export type AddressValue = {
  address: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  town: string;
  street?: string;
  postcode?: string;
};

export type PlacesSuggestion = {
  id: string;
  label: string;
  placePrediction: {
    placeId?: string;
    text?: { toString: () => string };
    toPlace: () => {
      id?: string;
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
      fetchFields: (options: { fields: string[] }) => Promise<void>;
    };
  };
};

type GoogleAutocompleteSuggestion = {
  label?: string;
  placePrediction?: PlacesSuggestion["placePrediction"];
};

type GooglePlacesLibrary = {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (options: {
      input: string;
      includedRegionCodes: string[];
      sessionToken: object | null;
    }) => Promise<{ suggestions?: GoogleAutocompleteSuggestion[] }>;
  };
  AutocompleteSessionToken: new () => object;
};

type GoogleMapsApi = {
  accounts?: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      prompt: () => void;
      renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
    };
  };
  maps?: {
    importLibrary: (name: "places") => Promise<GooglePlacesLibrary>;
    Geocoder: new () => {
      geocode: (options: { address: string; componentRestrictions: { country: string }; region: string }) => Promise<{
        results?: Array<{
          formatted_address?: string;
          geometry?: { location?: { lat: () => number; lng: () => number } };
        }>;
      }>;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __localproGooglePlacesReady?: () => void;
  }
}

type Props = {
  label: string;
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  note?: string;
};

const googlePlacesApiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";
const googlePlacesCountry = process.env.NEXT_PUBLIC_GOOGLE_PLACES_COUNTRY ?? "LT";
const googlePlacesFields = ["formattedAddress", "id", "location"];
const googlePlacesCallbackName = "__localproGooglePlacesReady";
const googlePlacesScriptTimeoutMs = 10_000;
let googlePlacesScriptPromise: Promise<void> | null = null;
export const addressNoResultsLabel = "Adresų nerasta";

export function shouldRequestAddressSuggestions(address: string, placeId: string) {
  return address.trim().length >= 3 && !placeId;
}

export function manualAddressValue(value: AddressValue, address: string): AddressValue {
  return { ...value, address, placeId: "", latitude: null, longitude: null, town: "", street: "", postcode: "" };
}

export default function AddressAutocomplete({ label, value, onChange, required, placeholder, className = "", note }: Props) {
  const listId = `address-suggestions-${useId().replaceAll(":", "")}`;
  const [suggestions, setSuggestions] = useState<PlacesSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState("");
  const requestIdRef = useRef(0);
  const sessionTokenRef = useRef<object | null>(null);

  useEffect(() => {
    const input = value.address.trim();
    const requestId = ++requestIdRef.current;
    if (!shouldRequestAddressSuggestions(input, value.placeId) || !googlePlacesApiKey) {
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setStatus("");
      try {
        const places = await loadGooglePlacesLibrary();
        sessionTokenRef.current ??= new places.AutocompleteSessionToken();
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: [googlePlacesCountry.toLowerCase()],
          sessionToken: sessionTokenRef.current
        });
        const nextSuggestions = (response.suggestions ?? [])
          .map(normalizePlacesSuggestion)
          .filter((item): item is PlacesSuggestion => Boolean(item));
        if (requestId !== requestIdRef.current) return;
        setSuggestions(nextSuggestions);
        setSearched(true);
        setOpen(true);
        setActiveIndex(nextSuggestions.length ? 0 : -1);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setOpen(false);
        setSearched(false);
        setStatus("Adreso paieška laikinai neveikia. Galite adresą įrašyti ranka.");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value.address, value.placeId]);

  function updateManualAddress(address: string) {
    onChange(manualAddressValue(value, address));
  }

  async function selectSuggestion(suggestion: PlacesSuggestion) {
    setLoading(true);
    try {
      const selected = await resolvePlacesSuggestionSelection(suggestion);
      onChange(selected);
      sessionTokenRef.current = null;
      setStatus("");
      close();
    } catch {
      setStatus("Adreso pasirinkti nepavyko. Galite adresą palikti įrašytą ranka.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setSuggestions([]);
    setSearched(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && open && suggestions[activeIndex]) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]);
    }
  }

  return (
    <label className={`address-autocomplete ${className}`.trim()}>
      {label}{required ? " *" : ""}
      <input
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        role="combobox"
        required={required}
        value={value.address}
        onBlur={() => window.setTimeout(close, 150)}
        onChange={(event) => updateManualAddress(event.target.value)}
        onFocus={() => setOpen(searched)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="text"
        autoComplete="street-address"
      />
      {loading ? <span className="address-loading">Ieškoma...</span> : null}
      {open ? (
        <ul className="address-suggestions" id={listId} role="listbox">
          {suggestions.length ? suggestions.map((suggestion, index) => (
            <li aria-selected={index === activeIndex} id={`${listId}-${index}`} key={suggestion.id} role="option">
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void selectSuggestion(suggestion)}
              >
                {suggestion.label}
              </button>
            </li>
          )) : <li className="address-empty" role="option" aria-selected="false">{addressNoResultsLabel}</li>}
        </ul>
      ) : null}
      {note ? <span className="field-note">{note}</span> : null}
      {status ? <span className="status-message error">{status}</span> : null}
    </label>
  );
}

export function normalizePlacesSuggestion(suggestion: GoogleAutocompleteSuggestion): PlacesSuggestion | null {
  if (!suggestion.placePrediction) return null;
  const label = suggestion.placePrediction.text?.toString() ?? suggestion.label ?? suggestion.placePrediction.placeId ?? "";
  if (!label) return null;
  return { id: suggestion.placePrediction.placeId ?? label, label, placePrediction: suggestion.placePrediction };
}

export async function resolvePlacesSuggestionSelection(suggestion: PlacesSuggestion): Promise<AddressValue> {
  const placeId = suggestion.placePrediction.placeId ?? suggestion.id;
  const place = suggestion.placePrediction.toPlace();
  await place.fetchFields({ fields: googlePlacesFields });
  const address = place.formattedAddress ?? suggestion.label;
  const derived = deriveAddressParts(address);
  return {
    address,
    placeId: place.id ?? placeId,
    latitude: place.location?.lat() ?? null,
    longitude: place.location?.lng() ?? null,
    town: derived.town,
    street: derived.street,
    postcode: derived.postcode
  };
}

export async function geocodeLithuanianAddress(address: string): Promise<AddressValue | null> {
  await loadGooglePlacesScript();
  const maps = window.google?.maps;
  if (!maps) return null;
  const response = await new maps.Geocoder().geocode({
    address,
    componentRestrictions: { country: googlePlacesCountry },
    region: googlePlacesCountry.toLowerCase()
  });
  const result = response.results?.[0];
  const location = result?.geometry?.location;
  if (!location) return null;
  const formattedAddress = result.formatted_address ?? address;
  const derived = deriveAddressParts(formattedAddress);
  return {
    address: formattedAddress,
    placeId: "",
    latitude: location.lat(),
    longitude: location.lng(),
    town: derived.town,
    street: derived.street,
    postcode: derived.postcode
  };
}

async function loadGooglePlacesLibrary() {
  await loadGooglePlacesScript();
  return window.google?.maps?.importLibrary("places") ?? Promise.reject(new Error("Google Places API is not available."));
}

export function loadGooglePlacesScript() {
  if (!googlePlacesApiKey) return Promise.reject(new Error("Google Places API key is not configured."));
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;

  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (window[googlePlacesCallbackName] === handleReady) delete window[googlePlacesCallbackName];
    };
    const rejectWith = (error: Error) => {
      cleanup();
      googlePlacesScriptPromise = null;
      reject(error);
    };
    const handleReady = () => {
      if (typeof window.google?.maps?.importLibrary !== "function") {
        rejectWith(new Error("Google Maps loaded without importLibrary."));
        return;
      }
      cleanup();
      resolve();
    };
    window[googlePlacesCallbackName] = handleReady;
    const timeoutId = window.setTimeout(() => rejectWith(new Error("Google Places timed out before the Google callback fired.")), googlePlacesScriptTimeoutMs);
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-localpro-google-places]");
    if (existingScript) {
      existingScript.addEventListener("error", () => rejectWith(new Error("Google Places failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googlePlacesApiKey)}&v=weekly&libraries=places&loading=async&callback=${googlePlacesCallbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.localproGooglePlaces = "true";
    script.onerror = () => rejectWith(new Error("Google Places failed to load."));
    document.head.appendChild(script);
  });
  return googlePlacesScriptPromise;
}

function deriveAddressParts(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const townLine = parts.find((part) => /\bLT-?\d{5}\b/i.test(part)) ?? parts[1] ?? "";
  const postcode = townLine.match(/\bLT-?\d{5}\b/i)?.[0] ?? "";
  const town = townLine.replace(/\bLT-?\d{5}\b/i, "").trim() || parts[1] || "";
  return { street, postcode, town };
}
