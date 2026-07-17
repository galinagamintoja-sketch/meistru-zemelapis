"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Specialist } from "../lib/types";
import { formatMasterCount, formatReviewCount, formatSpecialistCount, formatVerificationBadge, formatVerificationSummary } from "../lib/display";

type Props = {
  initialSpecialists: Specialist[];
  categories: Category[];
};

export type RegistrationDraft = {
  name: string;
  phone: string;
  email: string;
  address: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  city: string;
  town: string;
  street: string;
  postcode: string;
  houseNumber: string;
  trade: string;
  categorySlugs: string[];
  subcategorySlugs: string[];
  photoUrls: string[];
  photoUploads: Array<{
    name: string;
    type: "image/jpeg" | "image/png" | "image/webp";
    size: number;
    dataUrl: string;
  }>;
  description: string;
  radiusKm: number;
  travelRange: "10" | "25" | "50" | "100" | "lt";
  operatingCities: string[];
  consentAccepted: boolean;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  publicContactConsent: boolean;
  marketingConsent: boolean;
  whatsappCommunicationConsent: boolean;
};

type LoginUser = {
  email: string;
  name: string;
  picture?: string;
};

type RegistrationErrorResponse = {
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

type LocationResolveResponse = {
  coordinates?: {
    lat: number;
    lng: number;
  };
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
      location?: {
        lat: () => number;
        lng: () => number;
      };
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

type GoogleGeocoderResult = {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
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
      geocode: (options: {
        address: string;
        componentRestrictions: { country: string };
        region: string;
      }) => Promise<{ results?: GoogleGeocoderResult[] }>;
    };
  };
};

type RegistrationAddressResolutionOptions = {
  googlePlacesCountry?: string;
  googlePlacesApiKeyConfigured?: boolean;
  timeoutMs?: number;
  loadGooglePlacesScript?: () => Promise<void>;
  getGoogleMaps?: () => GoogleMapsApi["maps"] | undefined;
};

type RegistrationSubmitOptions = RegistrationAddressResolutionOptions & {
  selectedCategoryNames?: string[];
  fetcher?: typeof fetch;
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __localproGooglePlacesReady?: () => void;
  }
}

const photoFieldMetadata = {
  maxItems: 8,
  maxSizeMb: 5,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const
};

const registrationFieldLabels: Record<string, string> = {
  name: "vardą arba įmonės pavadinimą",
  phone: "telefono numerį",
  whatsapp: "WhatsApp numerį",
  email: "el. paštą",
  address: "adresą",
  city: "pagrindinį miestą",
  trade: "darbo sritį",
  categorySlugs: "darbo sritį",
  subcategorySlugs: "konkrečias paslaugas",
  description: "trumpą aprašymą",
  radiusKm: "darbo spindulį",
  town: "miestą arba gyvenvietę",
  street: "gatvę",
  postcode: "pašto kodą",
  travelRange: "vykimo į darbus atstumą",
  operatingCities: "aptarnaujamas vietas",
  photoUrls: "nuotraukų URL",
  photoUploads: "įkeltas nuotraukas",
  consentAccepted: "sutikimą dėl profilio peržiūros"
};

const cities = ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys", "Lentvaris", "Alytus", "Marijampolė", "Utena", "Tauragė", "Telšiai"];
const verificationOptions = [
  { value: "contact", label: "Kontaktas patvirtintas" },
  { value: "portfolio", label: "Yra darbų nuotraukų" },
  { value: "whatsapp", label: "Galima susisiekti per WhatsApp" }
];
const customerRadiusOptions = [5, 10, 20, 35, 50, 100];
const travelRangeOptions = [
  { value: "10", label: "Iki 10 km" },
  { value: "25", label: "Iki 25 km" },
  { value: "50", label: "Iki 50 km" },
  { value: "100", label: "Iki 100 km" },
  { value: "lt", label: "Visa Lietuva" }
] as const;
const googlePlacesApiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";
const googlePlacesCountry = normalizeGooglePlacesCountryCode(process.env.NEXT_PUBLIC_GOOGLE_PLACES_COUNTRY);
const googlePlacesFields = ["formattedAddress", "id", "location"];
const googlePlacesCallbackName = "__localproGooglePlacesReady";
const googlePlacesScriptTimeoutMs = 10_000;
const googleAddressResolutionTimeoutMs = 3_500;
let googlePlacesScriptPromise: Promise<void> | null = null;

export function normalizePlacesSuggestion(suggestion: GoogleAutocompleteSuggestion): PlacesSuggestion | null {
  if (!suggestion.placePrediction) {
    return null;
  }

  const label = suggestion.placePrediction.text?.toString() ?? suggestion.label ?? suggestion.placePrediction.placeId ?? "";

  if (!label) {
    return null;
  }

  return {
    id: suggestion.placePrediction.placeId ?? label,
    label,
    placePrediction: suggestion.placePrediction
  };
}

export function normalizeGooglePlacesCountryCode(value: string | undefined | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "LT";
}

export async function resolvePlacesSuggestionSelection(suggestion: PlacesSuggestion) {
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

export async function resolveRegistrationAddressWithFallback(
  draft: RegistrationDraft,
  options: RegistrationAddressResolutionOptions = {}
) {
  if (draft.latitude !== null && draft.longitude !== null) {
    return { draft, usedManualFallback: false };
  }

  const address = draft.address.trim();
  const googleConfigured = options.googlePlacesApiKeyConfigured ?? Boolean(googlePlacesApiKey);
  if (!address || !googleConfigured) {
    return { draft, usedManualFallback: true };
  }

  const country = options.googlePlacesCountry ?? googlePlacesCountry;
  const loadScript = options.loadGooglePlacesScript ?? loadGooglePlacesScript;
  const getMaps = options.getGoogleMaps ?? (() => window.google?.maps);
  const timeoutMs = options.timeoutMs ?? googleAddressResolutionTimeoutMs;

  try {
    const resolvedDraft = await withTimeout(async () => {
      await loadScript();
      const maps = getMaps();
      if (!maps?.Geocoder) {
        throw new Error("Google geocoder is not available.");
      }

      const geocoder = new maps.Geocoder();
      const response = await geocoder.geocode({
        address,
        componentRestrictions: { country },
        region: country.toLowerCase()
      });
      const result = response.results?.[0];
      const location = result?.geometry?.location;
      if (!location) {
        throw new Error("Google geocoder returned no coordinates.");
      }

      const resolvedAddress = result.formatted_address ?? address;
      const derived = deriveAddressParts(resolvedAddress);
      return {
        ...draft,
        address: resolvedAddress,
        latitude: location.lat(),
        longitude: location.lng(),
        town: draft.town || derived.town,
        street: draft.street || derived.street,
        postcode: draft.postcode || derived.postcode
      };
    }, timeoutMs, "Google address resolution timed out.");

    return { draft: resolvedDraft, usedManualFallback: false };
  } catch {
    return { draft, usedManualFallback: true };
  }
}

export async function submitRegistrationDraft(draft: RegistrationDraft, options: RegistrationSubmitOptions = {}) {
  const addressResolution = await resolveRegistrationAddressWithFallback(draft, options);
  const registrationPayload = {
    ...addressResolution.draft,
    trade: addressResolution.draft.trade || options.selectedCategoryNames?.[0] || addressResolution.draft.categorySlugs[0] || "",
    photoUrls: addressResolution.draft.photoUrls.map((url) => url.trim()).filter(Boolean)
  };
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("/api/tradesperson/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registrationPayload)
  });
  const data = await response.json();

  return {
    response,
    data,
    payload: registrationPayload,
    usedManualFallback: addressResolution.usedManualFallback
  };
}

export default function LocalProApp({ initialSpecialists, categories }: Props) {
  const [trade, setTrade] = useState("all");
  const [city, setCity] = useState("all");
  const [verification, setVerification] = useState("all");
  const [customerRadiusKm, setCustomerRadiusKm] = useState(20);
  const [availableSoonOnly, setAvailableSoonOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState("0");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [mapNeedsSearch, setMapNeedsSearch] = useState(false);
  const [mapSearchPoint, setMapSearchPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [specialists, setSpecialists] = useState(initialSpecialists);
  const [activeId, setActiveId] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const [mapPopupId, setMapPopupId] = useState("");
  const [mapZoom, setMapZoom] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locationResolving, setLocationResolving] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<PlacesSuggestion[]>([]);
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressActiveIndex, setAddressActiveIndex] = useState(-1);
  const [addressStatus, setAddressStatus] = useState("");
  const [formState, setFormState] = useState<RegistrationDraft>({
    name: "",
    phone: "",
    email: "",
    address: "",
    placeId: "",
    latitude: null,
    longitude: null,
    city: "",
    town: "",
    street: "",
    postcode: "",
    houseNumber: "",
    trade: "",
    categorySlugs: [],
    subcategorySlugs: [],
    photoUrls: [""],
    photoUploads: [],
    description: "",
    radiusKm: 25,
    travelRange: "25",
    operatingCities: [] as string[],
    consentAccepted: false,
    termsAccepted: false,
    privacyAcknowledged: false,
    publicContactConsent: false,
    marketingConsent: false,
    whatsappCommunicationConsent: false
  });
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitTone, setSubmitTone] = useState<"success" | "error" | "">("");
  const [submittedProfileId, setSubmittedProfileId] = useState("");
  const [submittedManualAddressReview, setSubmittedManualAddressReview] = useState(false);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const profileSectionRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const areaLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const hasPrefilledGoogleProfile = useRef(false);
  const lastFitKeyRef = useRef("");
  const placesSessionTokenRef = useRef<object | null>(null);
  const addressSuggestionRequestRef = useRef(0);
  const selectedPlaceCacheRef = useRef(new Map<string, Pick<RegistrationDraft, "address" | "placeId" | "latitude" | "longitude" | "town" | "street" | "postcode">>());

  const activeSpecialist = useMemo(
    () => specialists.find((specialist) => specialist.id === activeId) ?? null,
    [activeId, specialists]
  );
  const activeWorkPhotos = useMemo(() => {
    if (!activeSpecialist) {
      return [];
    }

    const imageUrls = activeSpecialist.photoUrls?.filter(Boolean) ?? [];
    if (imageUrls.length) {
      return imageUrls.map((url, index) => ({
        id: `${url}-${index}`,
        url,
        label: index === 0 ? "Pagrindinė darbų nuotrauka" : "Darbų nuotrauka"
      }));
    }

    return activeSpecialist.photos.map((label, index) => ({
      id: `${label}-${index}`,
      url: "",
      label
    }));
  }, [activeSpecialist]);
  const activePhotoUrl = activeSpecialist?.photoUrls?.find(Boolean) ?? "";
  const filterSummary = useMemo(
    () => [
      trade !== "all" ? serviceLabel(categories, trade) : "Visos sritys",
      city !== "all" ? city : "Visa Lietuva",
      `${customerRadiusKm} km`,
      verification !== "all" ? verificationOptions.find((item) => item.value === verification)?.label ?? verification : null,
      verifiedOnly ? "Tik patikrinti" : null,
      availableSoonOnly ? "Gali greitai pradėti" : null,
      Number(minRating) > 0 ? `${minRating}+` : null
    ].filter(Boolean),
    [availableSoonOnly, categories, city, customerRadiusKm, minRating, trade, verification, verifiedOnly]
  );
  const hasActiveFilters =
    trade !== "all" ||
    city !== "all" ||
    customerRadiusKm !== 20 ||
    verification !== "all" ||
    availableSoonOnly ||
    verifiedOnly ||
    minRating !== "0" ||
    Boolean(mapSearchPoint);
  const selectedCategoryNames = useMemo(
    () =>
      categories
        .filter((category) => formState.categorySlugs.includes(category.slug))
        .map((category) => category.name),
    [categories, formState.categorySlugs]
  );
  const selectedSubcategories = useMemo(
    () => categories.filter((category) => formState.categorySlugs.includes(category.slug)).flatMap((category) => category.subcategories),
    [categories, formState.categorySlugs]
  );
  const specialistsKey = useMemo(() => specialists.map((specialist) => specialist.id).join("|"), [specialists]);

  const selectSpecialist = useCallback((specialistId: string, shouldScroll: boolean) => {
    setActiveId(specialistId);
    const specialist = specialists.find((item) => item.id === specialistId);
    const map = mapRef.current;
    if (specialist && map) {
      map.setView([specialist.lat, specialist.lng], Math.max(map.getZoom(), 12), { animate: true });
    }
    if (shouldScroll) {
      setMapPopupId("");
      window.setTimeout(() => {
        profileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", "#profile");
      }, 0);
    }
  }, [specialists]);

  useEffect(() => {
    const controller = new AbortController();

    async function prefillRegistrationFromSession() {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await response.json()) as { user?: LoginUser | null };
      const user = data.user;

      if (!user || hasPrefilledGoogleProfile.current) {
        return;
      }

      setFormState((current) => {
        hasPrefilledGoogleProfile.current = true;
        return {
          ...current,
          name: current.name.trim() ? current.name : user.name,
          email: current.email.trim() ? current.email : user.email
        };
      });
    }

    prefillRegistrationFromSession().catch((error) => {
      if (error.name !== "AbortError") {
        hasPrefilledGoogleProfile.current = true;
      }
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpecialists() {
      setLoading(true);
      const params = new URLSearchParams();
      if (trade !== "all") params.set("service", trade);
      if (city !== "all") params.set("location", city);
      params.set("customerRadiusKm", String(customerRadiusKm));
      if (mapSearchPoint) {
        params.set("lat", String(mapSearchPoint.lat));
        params.set("lng", String(mapSearchPoint.lng));
      }
      if (verification !== "all") params.set("verification", verification);
      if (verifiedOnly) params.set("verified", "true");
      if (availableSoonOnly) params.set("availableSoon", "true");
      if (minRating !== "0") params.set("minRating", minRating);

      const response = await fetch(`/api/specialists?${params.toString()}`, { signal: controller.signal });
      const data = await response.json();
      const list = data.specialists ?? [];
      setSpecialists(list);
      setActiveId((current) => (list.some((specialist: Specialist) => specialist.id === current) ? current : ""));
      setLoading(false);
    }

    loadSpecialists().catch((error) => {
      if (error.name !== "AbortError") {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [trade, city, customerRadiusKm, verification, verifiedOnly, availableSoonOnly, minRating, mapSearchPoint]);

  useEffect(() => {
    const location = city === "all" ? "" : city.trim();
    if (!location) {
      setLocationResolving(false);
      setMapSearchPoint(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocationResolving(true);
      try {
        const response = await fetch(`/api/geo/resolve?location=${encodeURIComponent(location)}`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as LocationResolveResponse;
        if (!data.coordinates) {
          return;
        }

        setMapSearchPoint(data.coordinates);
        setMapNeedsSearch(false);
        mapRef.current?.setView([data.coordinates.lat, data.coordinates.lng], Math.max(mapRef.current.getZoom(), 11), {
          animate: true
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMapSearchPoint(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLocationResolving(false);
        }
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city]);

  useEffect(() => {
    const input = formState.address.trim();
    const requestId = ++addressSuggestionRequestRef.current;
    if (!input || formState.placeId || input.length < 3 || !googlePlacesApiKey) {
      setAddressSuggestions([]);
      setAddressSearchOpen(false);
      setAddressLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressStatus("");

      try {
        const places = await loadGooglePlacesLibrary();
        const AutocompleteSuggestion = places.AutocompleteSuggestion;
        const AutocompleteSessionToken = places.AutocompleteSessionToken;
        placesSessionTokenRef.current ??= new AutocompleteSessionToken();

        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: [googlePlacesCountry.toLowerCase()],
          sessionToken: placesSessionTokenRef.current
        });
        const suggestions = (response.suggestions ?? [])
          .map(normalizePlacesSuggestion)
          .filter((suggestion): suggestion is PlacesSuggestion => Boolean(suggestion));

        if (requestId !== addressSuggestionRequestRef.current) {
          return;
        }

        setAddressSuggestions(suggestions);
        setAddressSearchOpen(Boolean(suggestions.length));
        setAddressActiveIndex(suggestions.length ? 0 : -1);
      } catch {
        if (requestId !== addressSuggestionRequestRef.current) {
          return;
        }

        setAddressSuggestions([]);
        setAddressSearchOpen(false);
        setAddressStatus("Adreso paieška laikinai neveikia. Galite adresą įrašyti ranka.");
      } finally {
        if (requestId === addressSuggestionRequestRef.current) {
          setAddressLoading(false);
        }
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [formState.address, formState.placeId]);

  useEffect(() => {
    let cancelled = false;

    async function setupMap() {
      if (!mapElementRef.current || mapRef.current) return;

      const leaflet = await import("leaflet");
      if (cancelled || !mapElementRef.current) return;

      const map = leaflet.map(mapElementRef.current, {
        center: [55.1, 23.9],
        zoom: 7,
        minZoom: 6,
        maxZoom: 15,
        scrollWheelZoom: true,
        zoomControl: true
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        })
        .addTo(map);

      mapRef.current = map;
      markerLayerRef.current = leaflet.layerGroup().addTo(map);
      areaLayerRef.current = leaflet.layerGroup().addTo(map);
      setMapZoom(map.getZoom());
      map.on("zoomend", () => setMapZoom(map.getZoom()));
      map.on("moveend", () => setMapNeedsSearch(true));
      setTimeout(() => map.invalidateSize(), 80);
    }

    setupMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function renderMap() {
      const map = mapRef.current;
      const markerLayer = markerLayerRef.current;
      const areaLayer = areaLayerRef.current;
      if (!map || !markerLayer || !areaLayer) return;

      const leaflet = await import("leaflet");
      markerLayer.clearLayers();
      areaLayer.clearLayers();

      const highlightedSpecialist = specialists.find((specialist) => specialist.id === activeId);
      if (highlightedSpecialist) {
        leaflet
          .circle([highlightedSpecialist.lat, highlightedSpecialist.lng], {
            radius: highlightedSpecialist.radius * 1000,
            color: highlightedSpecialist.color,
            weight: highlightedSpecialist.id === activeId ? 3 : 2,
            fillColor: highlightedSpecialist.color,
            fillOpacity: highlightedSpecialist.id === activeId ? 0.16 : 0.1
          })
          .addTo(areaLayer);
      }

      createMapMarkerItems(specialists, map).forEach((item) => {
        if (item.type === "cluster") {
          const clusterIcon = leaflet.divIcon({
            html: `<span>${item.count}</span>`,
            className: "trade-cluster",
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          });
          const clusterMarker = leaflet
            .marker([item.lat, item.lng], {
              icon: clusterIcon,
              keyboard: true,
              title: `${formatSpecialistCount(item.count)} šioje žemėlapio vietoje`,
              alt: `${formatSpecialistCount(item.count)} šioje žemėlapio vietoje`
            })
            .bindPopup(createClusterPopup(item.points.map((point) => point.specialist)));
          clusterMarker.on("click", () => {
            setMapPopupId("");
            const target = item.points[0];
            if (map.getZoom() >= 13) {
              clusterMarker.openPopup();
              return;
            }
            map.setView([target.lat, target.lng], Math.min(Math.max(map.getZoom() + 2, 10), 13), { animate: true });
          });
          clusterMarker.on("keypress", (event: import("leaflet").LeafletKeyboardEvent) => {
            if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") {
              event.originalEvent.preventDefault();
              clusterMarker.fire("click");
            }
          });
          markerLayer.addLayer(clusterMarker);
          return;
        }

        const specialist = item.specialist;
        const isActive = specialist.id === activeId;
        const isHovered = specialist.id === hoveredId;
        const icon = leaflet.divIcon({
          className: `trade-marker${isActive ? " active" : ""}${isHovered ? " hovered" : ""}`,
          html: `<span style="background:${specialist.color}"><b>${specialist.trade.charAt(0)}</b></span>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          popupAnchor: [0, -20]
        });

        const markerLabel = `${specialist.name}, ${specialist.trade}, ${specialist.approximateLocation ?? specialist.town}`;
        const marker = leaflet
          .marker([item.lat, item.lng], {
            icon,
            keyboard: true,
            title: markerLabel,
            alt: markerLabel
          })
          .bindPopup(createMapPopup(specialist));

        marker.on("click", () => {
          setMapPopupId(specialist.id);
          selectSpecialist(specialist.id, false);
        });
        marker.on("keypress", (event: import("leaflet").LeafletKeyboardEvent) => {
          if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") {
            event.originalEvent.preventDefault();
            marker.fire("click");
            marker.openPopup();
          }
        });
        marker.on("mouseover", () => setHoveredId(specialist.id));
        marker.on("mouseout", () => setHoveredId(""));
        marker.on("focus", () => setHoveredId(specialist.id));
        marker.on("blur", () => setHoveredId(""));
        markerLayer.addLayer(marker);

      });

      if (specialists.length && lastFitKeyRef.current !== specialistsKey) {
        const bounds = leaflet.latLngBounds(specialists.map((specialist) => [specialist.lat, specialist.lng]));
        map.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 10 });
        lastFitKeyRef.current = specialistsKey;
      }

      setTimeout(() => map.invalidateSize(), 50);
    }

    renderMap();
  }, [activeId, hoveredId, mapPopupId, mapZoom, selectSpecialist, specialists, specialistsKey]);

  function stars(rating: number) {
    return "★".repeat(Math.max(0, Math.round(rating)));
  }

  function formatServiceList(specialist: Specialist) {
    const services = specialist.subcategoryNames?.length ? specialist.subcategoryNames : specialist.categoryNames?.length ? specialist.categoryNames : [specialist.trade];
    return services.slice(0, 6).join(", ");
  }

  function formatTrustSummary(specialist: Specialist) {
    if (specialist.verification.length) {
      return formatVerificationSummary(specialist.verification);
    }

    return specialist.publicContactConsentAt ? "Kontaktai patvirtinti publikavimui" : "Laukia papildomos patikros";
  }

  function openSpecialistProfile(specialistId: string) {
    selectSpecialist(specialistId, true);
  }

  function clearSelectedSpecialist() {
    setActiveId("");
    setHoveredId("");
    setMapPopupId("");
    window.history.replaceState(null, "", "#mapSection");
  }

  function clearDiscoveryFilters() {
    setTrade("all");
    setCity("all");
    setCustomerRadiusKm(20);
    setVerification("all");
    setAvailableSoonOnly(false);
    setVerifiedOnly(false);
    setMinRating("0");
    setMapSearchPoint(null);
    setMapNeedsSearch(false);
    setActiveId("");
  }

  function searchCurrentMapArea() {
    const center = mapRef.current?.getCenter();
    if (!center) {
      return;
    }

    setMapSearchPoint({ lat: center.lat, lng: center.lng });
    setMapNeedsSearch(false);
  }

  function updateRegistrationAddress(value: string) {
    setFormState((current) => ({
      ...current,
      address: value,
      placeId: "",
      latitude: null,
      longitude: null
    }));
  }

  async function selectAddressSuggestion(suggestion: PlacesSuggestion) {
    const placeId = suggestion.placePrediction.placeId ?? suggestion.id;
    const cached = selectedPlaceCacheRef.current.get(placeId);

    if (cached) {
      setFormState((current) => ({ ...current, ...cached }));
      closeAddressSuggestions();
      return;
    }

    setAddressLoading(true);
    try {
      const selected = await resolvePlacesSuggestionSelection(suggestion);

      selectedPlaceCacheRef.current.set(selected.placeId, selected);
      setFormState((current) => ({ ...current, ...selected, city: selected.town || current.city }));
      placesSessionTokenRef.current = null;
      closeAddressSuggestions();
      setAddressStatus("");
    } catch {
      setAddressStatus("Adreso pasirinkti nepavyko. Galite adresą palikti įrašytą ranka.");
    } finally {
      setAddressLoading(false);
    }
  }

  function closeAddressSuggestions() {
    setAddressSearchOpen(false);
    setAddressSuggestions([]);
    setAddressActiveIndex(-1);
  }

  async function resolveManualAddressBeforeSubmit() {
    const resolution = await resolveRegistrationAddressWithFallback(formState, {
      googlePlacesCountry,
      googlePlacesApiKeyConfigured: Boolean(googlePlacesApiKey),
      loadGooglePlacesScript,
      getGoogleMaps: () => window.google?.maps
    });
    setFormState(resolution.draft);
    return resolution;
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage("Siunčiama registracija...");
    setSubmitTone("");
    setSubmittedProfileId("");
    setSubmittedManualAddressReview(false);
    const addressResolution = await resolveManualAddressBeforeSubmit();

    const registration = await submitRegistrationDraft(addressResolution.draft, {
      selectedCategoryNames,
      googlePlacesApiKeyConfigured: false
    });
    setFormState(registration.payload);

    const response = registration.response;
    const data = registration.data;

    if (!response.ok) {
      setSubmitTone("error");
      setSubmitMessage(formatRegistrationError(data));
      return;
    }

    setSubmitTone("success");
    setSubmittedProfileId(data.profile?.id ?? "");
    setSubmittedManualAddressReview(addressResolution.usedManualFallback);
    setSubmitMessage(
      addressResolution.usedManualFallback
        ? "Registracija gauta. Profilį patikrinsime per 1-2 darbo dienas, o adresą prireikus peržiūrėsime rankiniu būdu."
        : "Registracija gauta. Profilį patikrinsime per 1-2 darbo dienas."
    );
  }

  function updateCategory(slug: string, checked: boolean) {
    setFormState((current) => {
      const categorySlugs = checked
        ? Array.from(new Set([...current.categorySlugs, slug]))
        : current.categorySlugs.filter((item) => item !== slug);
      const allowedSubcategorySlugs = new Set(
        categories.filter((category) => categorySlugs.includes(category.slug)).flatMap((category) => category.subcategories.map((item) => item.slug))
      );

      return {
        ...current,
        trade: categories.find((category) => categorySlugs.includes(category.slug))?.name ?? "",
        categorySlugs,
        subcategorySlugs: current.subcategorySlugs.filter((item) => allowedSubcategorySlugs.has(item))
      };
    });
  }

  function updateSubcategory(slug: string, checked: boolean) {
    setFormState((current) => {
      const categorySlug = getSubcategoryCategorySlug(slug);
      const categorySlugs = !categorySlug || current.categorySlugs.includes(categorySlug)
        ? current.categorySlugs
        : Array.from(new Set([...current.categorySlugs, categorySlug]));

      return {
        ...current,
        trade: categories.find((category) => categorySlugs.includes(category.slug))?.name ?? current.trade,
        categorySlugs,
        subcategorySlugs: checked
          ? Array.from(new Set([...current.subcategorySlugs, slug]))
          : current.subcategorySlugs.filter((item) => item !== slug)
      };
    });
  }

  function updatePhotoUrl(index: number, value: string) {
    setFormState((current) => {
      const photoUrls = [...current.photoUrls];
      photoUrls[index] = value;
      return { ...current, photoUrls };
    });
  }

  function addPhotoField() {
    setFormState((current) => {
      if (current.photoUrls.length >= photoFieldMetadata.maxItems) {
        return current;
      }

      return { ...current, photoUrls: [...current.photoUrls, ""] };
    });
  }

  function removePhotoField(index: number) {
    setFormState((current) => ({
      ...current,
      photoUrls: current.photoUrls.length > 1 ? current.photoUrls.filter((_, currentIndex) => currentIndex !== index) : [""]
    }));
  }

  async function updatePhotoUploads(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).slice(0, photoFieldMetadata.maxItems);
    const allowedTypes = new Set(photoFieldMetadata.acceptedTypes);
    const maxBytes = photoFieldMetadata.maxSizeMb * 1024 * 1024;

    for (const file of selectedFiles) {
      if (!allowedTypes.has(file.type as (typeof photoFieldMetadata.acceptedTypes)[number])) {
        setSubmitTone("error");
        setSubmitMessage("Įkelkite JPG, PNG arba WebP nuotraukas.");
        return;
      }

      if (file.size > maxBytes) {
        setSubmitTone("error");
        setSubmitMessage(`Viena nuotrauka gali būti iki ${photoFieldMetadata.maxSizeMb} MB.`);
        return;
      }
    }

    const photoUploads = await Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<RegistrationDraft["photoUploads"][number]>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                type: file.type as RegistrationDraft["photoUploads"][number]["type"],
                size: file.size,
                dataUrl: String(reader.result)
              });
            reader.onerror = () => reject(new Error("Nepavyko perskaityti nuotraukos."));
            reader.readAsDataURL(file);
          })
      )
    );

    setFormState((current) => ({ ...current, photoUploads }));
    setSubmitMessage("");
    setSubmitTone("");
  }

  function getSubcategoryCategorySlug(subcategorySlug: string) {
    return categories.find((category) => category.subcategories.some((item) => item.slug === subcategorySlug))?.slug ?? "";
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#search" aria-label="LocalPro.lt">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>
            <strong>LocalPro.lt</strong>
            <small>Meistrų žemėlapis</small>
          </span>
        </a>
        <nav className="stage-nav" aria-label="Puslapio skyriai">
          <a href="#search">Rasti specialistą</a>
          <a href="#register">Registruotis</a>
          <a href="#how">Kaip veikia</a>
          <a href="/login">Meistro paskyra</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="search">
          <div className="hero-copy">
            <h1>Patikimi meistrai jūsų mieste.</h1>
          </div>

          <form className="search-panel" aria-label="Rasti specialistą">
            <div className="panel-title">
              <strong>Kokio meistro ieškote?</strong>
              {loading || locationResolving ? <span>{loading ? "Kraunama" : "Tikslinama vieta"}</span> : null}
            </div>
            <label>
              Kokio darbo reikia?
              <select value={trade} onChange={(event) => setTrade(event.target.value)}>
                <option value="all">Visos sritys</option>
                {categories.map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    <option value={category.slug}>{category.name}</option>
                    {category.subcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.slug}>{subcategory.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Kur reikalingas meistras?
              <input
                list="localpro-cities"
                value={city === "all" ? "" : city}
                onChange={(event) => {
                  setCity(event.target.value.trim() || "all");
                  setMapSearchPoint(null);
                  setMapNeedsSearch(false);
                }}
                placeholder="Pvz. Vilnius, Lentvaris, Kaunas"
                type="text"
              />
              <datalist id="localpro-cities">
                {cities.map((item) => <option key={item} value={item} />)}
              </datalist>
            </label>
            <label>
              Paieškos spindulys
              <select value={customerRadiusKm} onChange={(event) => setCustomerRadiusKm(Number(event.target.value))}>
                {customerRadiusOptions.map((radius) => (
                  <option key={radius} value={radius}>{radius} km</option>
                ))}
              </select>
            </label>
            <details className="filter-drawer">
              <summary>Filtrai</summary>
              <label>
                Profilio signalai
                <select value={verification} onChange={(event) => setVerification(event.target.value)}>
                  <option value="all">Visi specialistai</option>
                  {verificationOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="check-line">
                <input type="checkbox" checked={availableSoonOnly} onChange={(event) => setAvailableSoonOnly(event.target.checked)} />
                Gali greitai pradėti
              </label>
              <label className="check-line">
                <input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} />
                Tik patikrinti
              </label>
              <label>
                Minimalus įvertinimas
                <select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                  <option value="0">Bet koks</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                  <option value="4.8">4.8+</option>
                </select>
              </label>
            </details>
            <noscript>
              <label>
                Miestas / rajonas
                <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="all">Visa Lietuva</option>
                {cities.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
                </select>
              </label>
            </noscript>
            <div className="hero-actions" aria-label="Pagrindiniai veiksmai">
              <a className="primary-action" href="#mapSection">Ieškoti žemėlapyje</a>
              <a className="secondary-action" href="#register">Tapti specialistu</a>
              {hasActiveFilters ? <button className="secondary-action action-button" type="button" onClick={clearDiscoveryFilters}>Išvalyti filtrus</button> : null}
            </div>
            <div className="active-filter-row" aria-label="Aktyvūs filtrai">
              {filterSummary.map((item) => <span key={String(item)}>{item}</span>)}
            </div>
          </form>
        </section>

        <section className="map-layout" id="mapSection" aria-label="LocalPro specialistų žemėlapis ir rezultatai">
          <div className="mobile-results-bar">
            <span>{specialists.length ? formatSpecialistCount(specialists.length) : "Nėra atitikmenų"}</span>
            <div className="segmented-control" aria-label="Rezultatų vaizdas">
              <button className={viewMode === "map" ? "active" : ""} type="button" onClick={() => setViewMode("map")}>Žemėlapis</button>
              <button className={viewMode === "list" ? "active" : ""} type="button" onClick={() => setViewMode("list")}>Sąrašas</button>
            </div>
          </div>
          <aside className={`results-column ${viewMode === "list" ? "mobile-active" : ""}`}>
            <div className="section-heading compact">
              <p className="eyebrow">Specialistai žemėlapyje</p>
              <h2>{specialists.length ? <span>{formatSpecialistCount(specialists.length)}</span> : "Būkite pirmasis specialistas šioje vietoje"}</h2>
              <p>{specialists.length ? "Pasirinkite specialistą sąraše arba žemėlapyje ir peržiūrėkite darbo zoną." : "Šio filtro rezultatai dar tušti. Registruokitės nemokamai ir jūsų profilis čia atsiras pirmas."}</p>
            </div>
            <div className="results-list" aria-live="polite">
              {specialists.length ? specialists.map((specialist) => (
                <button
                  aria-controls="profile"
                  className={`result-card ${specialist.id === activeId ? "active" : ""}`}
                  key={specialist.id}
                  onClick={() => openSpecialistProfile(specialist.id)}
                  onMouseEnter={() => setHoveredId(specialist.id)}
                  onMouseLeave={() => setHoveredId("")}
                  type="button"
                >
                  <span className="meta-row">
                    <strong>{specialist.name}</strong>
                    <span className="rating">{specialist.rating ? specialist.rating.toFixed(1) : "Naujas"} {stars(specialist.rating)}</span>
                  </span>
                  <span className="meta-row">
                    <span className="tag">{specialist.trade}</span>
                    {specialist.subcategoryNames?.slice(0, 2).map((name) => <span className="tag" key={name}>{name}</span>)}
                    <span className="tag">{specialist.approximateLocation ?? specialist.town}</span>
                    <span className="tag">{formatTravelRange(specialist.radius)}</span>
                    <span className="tag">{formatAvailability(specialist)}</span>
                    <span className="tag">{formatVerificationSummary(specialist.verification)}</span>
                  </span>
                  <span>
                    {formatReviewCount(specialist.reviewCount)}
                    {typeof specialist.distanceKm === "number" ? ` - apie ${specialist.distanceKm.toFixed(1)} km nuo vietos` : ""}
                    . {specialist.serviceArea}
                  </span>
                  <span className="open-profile-label">Atidaryti profilį</span>
                </button>
              )) : (
                <div className="empty-state">
                  <strong>Nėra atitikmenų pagal pasirinktus filtrus.</strong>
                  <span>Keiskite miestą arba darbo sritį, arba registruokite savo paslaugą LocalPro žemėlapyje.</span>
                  <div className="empty-actions">
                    {hasActiveFilters ? <button className="secondary-action action-button" type="button" onClick={clearDiscoveryFilters}>Išvalyti filtrus</button> : null}
                    <a className="primary-action" href="#register">Registruotis nemokamai</a>
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className={`map-board ${viewMode === "map" ? "mobile-active" : ""}`} aria-label="OpenStreetMap LocalPro specialistų žemėlapis">
            <div className="map-toolbar">
              <span>LocalPro žemėlapis</span>
              <span>{specialists.length ? formatMasterCount(specialists.length) : "Nėra atitikmenų"}</span>
            </div>
            <div className="real-map" ref={mapElementRef} aria-label="Interaktyvus OpenStreetMap su LocalPro specialistų žymekliais">
              {mapNeedsSearch ? (
                <button className="search-this-area" type="button" onClick={searchCurrentMapArea}>
                  Ieškoti šioje žemėlapio vietoje
                </button>
              ) : null}
              {activeSpecialist ? (
                <div className="selected-map-card">
                  <div className="selected-card-photo">
                    {activePhotoUrl ? <img src={activePhotoUrl} alt={`${activeSpecialist.name} darbų nuotrauka`} /> : activeSpecialist.trade.charAt(0)}
                  </div>
                  <div>
                    <strong>{activeSpecialist.companyName || activeSpecialist.name}</strong>
                    <span>{activeSpecialist.trade}</span>
                    <span>{activeSpecialist.rating ? activeSpecialist.rating.toFixed(1) : "Naujas"} ★ / {formatReviewCount(activeSpecialist.reviewCount)}</span>
                    <span>{formatVerificationSummary(activeSpecialist.verification)} · {activeSpecialist.approximateLocation ?? activeSpecialist.town}</span>
                    <span>{formatAvailability(activeSpecialist)}</span>
                    <span>{typeof activeSpecialist.distanceKm === "number" ? `${activeSpecialist.distanceKm.toFixed(1)} km` : "Atstumas tikslinamas"} · {formatTravelRange(activeSpecialist.radius)}</span>
                  </div>
                  <div className="selected-card-actions">
                    <button type="button" onClick={() => openSpecialistProfile(activeSpecialist.id)}>Peržiūrėti profilį</button>
                    <a href={`https://wa.me/${activeSpecialist.whatsapp}`} onClick={() => logEnquiry(activeSpecialist.id, "whatsapp_click")}>Siųsti užklausą</a>
                    <button type="button" onClick={clearSelectedSpecialist}>Uždaryti</button>
                  </div>
                </div>
              ) : null}
              <div className="map-hint">Darbo zonos yra apytikslės. Prieš užsakydami patvirtinkite adresą su specialistu.</div>
            </div>
          </section>
        </section>

        <section className="profile-section" id="profile" ref={profileSectionRef}>
          {activeSpecialist ? (
            <article className="profile-card" aria-live="polite">
              <div className="profile-summary">
                <p className="eyebrow">Pasirinktas specialistas</p>
                <h2>{activeSpecialist.name}</h2>
                <div className="tag-row">
                  <span className="tag">{activeSpecialist.trade}</span>
                  <span className="tag">{activeSpecialist.approximateLocation ?? activeSpecialist.town}</span>
                  <span className="tag">{formatTravelRange(activeSpecialist.radius)}</span>
                  <span className="tag">{formatAvailability(activeSpecialist)}</span>
                  <span className="tag">{formatVerificationSummary(activeSpecialist.verification)}</span>
                  <span className="rating">{activeSpecialist.rating ? activeSpecialist.rating.toFixed(1) : "Naujas"} {stars(activeSpecialist.rating)}</span>
                </div>
                <p>{formatReviewCount(activeSpecialist.reviewCount)}. Darbo zona: {activeSpecialist.serviceArea}.</p>
                <p>{activeSpecialist.description}</p>
                <div className="profile-detail-grid">
                  <div><strong>Paslaugos</strong><span>{formatServiceList(activeSpecialist)}</span></div>
                  <div><strong>Darbo zona</strong><span>{activeSpecialist.operatingCities.join(", ")} · {formatTravelRange(activeSpecialist.radius)}</span></div>
                  <div><strong>Vieta</strong><span>{activeSpecialist.approximateLocation ?? activeSpecialist.town}</span></div>
                  <div><strong>Patikimumas</strong><span>{formatTrustSummary(activeSpecialist)}</span></div>
                </div>
                <div className="verification-list">
                  {activeSpecialist.verification.length ? activeSpecialist.verification.map((label) => <span key={label}>{formatVerificationBadge(label)}</span>) : <span>Laukia papildomų patikros žymų</span>}
                </div>
                <div className="contact-list">
                  <a href={`tel:${activeSpecialist.phone.replaceAll(" ", "")}`} onClick={() => logEnquiry(activeSpecialist.id, "phone_click")}><span>Telefonas</span><strong>{activeSpecialist.phone}</strong></a>
                  <a href={`https://wa.me/${activeSpecialist.whatsapp}`} onClick={() => logEnquiry(activeSpecialist.id, "whatsapp_click")}><span>WhatsApp</span><strong>Rašyti dabar</strong></a>
                  <a href={`mailto:${activeSpecialist.email}`}><span>El. paštas</span><strong>{activeSpecialist.email}</strong></a>
                </div>
              </div>
              <div>
                <p className="eyebrow">Darbų nuotraukos</p>
                <div className="photo-grid">
                  {activeWorkPhotos.map((photo, index) => (
                    <div
                      className={photo.url ? "work-photo has-image" : "work-photo"}
                      key={photo.id}
                      style={{ "--photo-color": index === 0 ? activeSpecialist.color : index === 1 ? "#56717a" : "#b8763a" } as React.CSSProperties}
                    >
                      {photo.url ? <img src={photo.url} alt={photo.label} loading="lazy" /> : photo.label}
                    </div>
                  ))}
                </div>
                <p className="eyebrow">Atsiliepimai</p>
                <div className="reviews">
                  {activeSpecialist.reviews.length ? activeSpecialist.reviews.map(([author, score, text]) => (
                    <div className="review" key={`${author}-${text}`}>
                      <div className="review-head"><strong>{author}</strong><span className="rating">{score}.0 {stars(score)}</span></div>
                      <p>{text}</p>
                    </div>
                  )) : <div className="review"><p>Atsiliepimai laukiami po administratoriaus patvirtinimo.</p></div>}
                </div>
              </div>
            </article>
          ) : (
            <article className="profile-card empty-profile">
              <div className="profile-summary">
                <p className="eyebrow">Specialisto profilis</p>
                <h2>Pasirinkite specialistą žemėlapyje arba sąraše.</h2>
                <p>Profilis atsidarys tik pasirinkus konkretų meistrą.</p>
              </div>
            </article>
          )}
        </section>

        <section className="register-section" id="register">
          <div className="section-heading">
            <p className="eyebrow">Specialistams</p>
            <h2>Registruokitės nemokamai ir atsiraskite LocalPro žemėlapyje.</h2>
            <p>Registracijai paskyros nereikia. Prisijungimą galėsite susikurti vėliau, kad redaguotumėte profilį.</p>
          </div>

          <div className="register-grid">
            {submitTone === "success" ? (
              <article className="registration-form success-panel" aria-live="polite">
                <p className="eyebrow">Registracija gauta</p>
                <h3>Profilį patikrinsime per 1-2 darbo dienas.</h3>
                <p>Patvirtinimą arba klausimus išsiųsime telefonu arba el. paštu. Jei reikės pataisyti informaciją, susisieksime prieš publikuodami profilį žemėlapyje.</p>
                {submittedManualAddressReview ? <p>Adresas gautas kaip įrašytas ranka. Prieš publikavimą jį peržiūrėsime ir prireikus patikslinsime.</p> : null}
                {submittedProfileId ? <p className="field-note">Registracijos numeris: {submittedProfileId}</p> : null}
                <a className="primary-action" href="/">Grįžti į žemėlapį</a>
              </article>
            ) : (
            <form className="registration-form" aria-label="LocalPro specialisto registracijos forma" onSubmit={submitRegistration}>
              <div className="form-row">
                <label>
                  Vardas arba imones pavadinimas *
                  <input value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} type="text" autoComplete="name" />
                </label>
                <label>
                  Telefono numeris *
                  <input value={formState.phone} onChange={(event) => setFormState({ ...formState, phone: event.target.value })} type="tel" autoComplete="tel" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  El. pastas *
                  <input value={formState.email} onChange={(event) => setFormState({ ...formState, email: event.target.value })} type="email" autoComplete="email" />
                </label>
                <label className="address-autocomplete">
                  Registracijos adresas *
                  <input
                    aria-activedescendant={addressActiveIndex >= 0 ? `address-suggestion-${addressActiveIndex}` : undefined}
                    aria-autocomplete="list"
                    aria-controls="address-suggestions"
                    aria-expanded={addressSearchOpen}
                    role="combobox"
                    value={formState.address}
                    onBlur={() => window.setTimeout(closeAddressSuggestions, 120)}
                    onChange={(event) => updateRegistrationAddress(event.target.value)}
                    onFocus={() => setAddressSearchOpen(Boolean(addressSuggestions.length))}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeAddressSuggestions();
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setAddressActiveIndex((current) => Math.min(current + 1, addressSuggestions.length - 1));
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setAddressActiveIndex((current) => Math.max(current - 1, 0));
                      }
                      if (event.key === "Enter" && addressSearchOpen && addressSuggestions[addressActiveIndex]) {
                        event.preventDefault();
                        selectAddressSuggestion(addressSuggestions[addressActiveIndex]).catch(() => {
                          setAddressStatus("Adreso pasirinkti nepavyko. Galite adresa palikti irasyta ranka.");
                        });
                      }
                    }}
                    placeholder="Pvz. Traku g. 10, Lentvaris"
                    type="text"
                    autoComplete="street-address"
                  />
                  {addressLoading ? <span className="address-loading">Ieskoma...</span> : null}
                </label>
              </div>
              {addressSearchOpen && addressSuggestions.length ? (
                <ul className="address-suggestions" id="address-suggestions" role="listbox">
                  {addressSuggestions.map((suggestion, index) => (
                    <li
                      aria-selected={index === addressActiveIndex}
                      id={`address-suggestion-${index}`}
                      key={suggestion.id}
                      role="option"
                    >
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectAddressSuggestion(suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="field-note">Tai pagrindinė darbo vieta. Tikslus adresas naudojamas privačiam geokodavimui; viešai rodoma tik apytikslė vieta.</p>
              {addressStatus ? <p className="status-message error">{addressStatus}</p> : null}
              <fieldset>
                <legend>Darbo sritys *</legend>
                {categories.map((category) => (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={formState.categorySlugs.includes(category.slug)}
                      onChange={(event) => updateCategory(category.slug, event.target.checked)}
                    />
                    {category.name}
                  </label>
                ))}
              </fieldset>
              {selectedSubcategories.length ? (
                <fieldset>
                  <legend>Konkrečios paslaugos nebūtinos</legend>
                  <p className="field-note">Pažymėkite tik tai, kas tiksliai tinka. Jei paslaugos sąraše nėra, įrašykite ją aprašyme.</p>
                  {selectedSubcategories.map((subcategory) => (
                    <label key={subcategory.id}>
                      <input
                        type="checkbox"
                        checked={formState.subcategorySlugs.includes(subcategory.slug)}
                        onChange={(event) => updateSubcategory(subcategory.slug, event.target.checked)}
                      />
                      {subcategory.name}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <label>
                Trumpas aprašymas *
                <textarea value={formState.description} onChange={(event) => setFormState({ ...formState, description: event.target.value })} rows={4} />
              </label>
              <fieldset>
                <legend>Darbų nuotraukos nebūtinos</legend>
                <p className="field-note">
                  Galite pridėti darbų pavyzdžius dabar arba papildyti profilį vėliau. {photoFieldMetadata.acceptedTypes.join(", ")}; iki {photoFieldMetadata.maxItems} nuotraukų; iki {photoFieldMetadata.maxSizeMb} MB kiekviena.
                </p>
                <label>
                  Įkelti nuotraukas
                  <input
                    type="file"
                    accept={photoFieldMetadata.acceptedTypes.join(",")}
                    multiple
                    onChange={(event) => updatePhotoUploads(event.target.files).catch(() => {
                      setSubmitTone("error");
                      setSubmitMessage("Nuotraukų įkelti nepavyko.");
                    })}
                  />
                  <span>{formState.photoUploads.length ? `${formState.photoUploads.length} nuotraukos paruoštos įkelti` : "Pasirinkite failus iš telefono arba kompiuterio"}</span>
                </label>
                {formState.photoUrls.map((photoUrl, index) => (
                  <div className="form-row" key={`photo-url-${index}`}>
                    <label>
                      Nuotraukos URL {index + 1}
                      <input
                        value={photoUrl}
                        onChange={(event) => updatePhotoUrl(index, event.target.value)}
                        type="url"
                        placeholder="https://..."
                        autoComplete="off"
                      />
                    </label>
                    <button type="button" className="secondary-action" onClick={() => removePhotoField(index)}>
                      Pašalinti
                    </button>
                  </div>
                ))}
                <button type="button" className="secondary-action" onClick={addPhotoField} disabled={formState.photoUrls.length >= photoFieldMetadata.maxItems}>
                  Pridėti URL
                </button>
              </fieldset>
              <fieldset>
                <legend>Kokiu atstumu vykstate į darbus? *</legend>
                <p className="field-note">Darbo zona skaičiuojama kaip spindulys aplink pagrindinę darbo vietą.</p>
                {travelRangeOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="travelRange"
                      checked={formState.travelRange === option.value}
                      onChange={() =>
                        setFormState({
                          ...formState,
                          travelRange: option.value,
                          radiusKm: option.value === "lt" ? 150 : Number(option.value)
                        })
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <label>
                <span>
                  <input type="checkbox" checked={formState.termsAccepted} onChange={(event) => setFormState({ ...formState, termsAccepted: event.target.checked, consentAccepted: event.target.checked && formState.privacyAcknowledged && formState.publicContactConsent })} />
                  Sutinku su LocalPro naudojimosi salygomis.
                </span>
              </label>
              <label>
                <span>
                  <input type="checkbox" checked={formState.privacyAcknowledged} onChange={(event) => setFormState({ ...formState, privacyAcknowledged: event.target.checked, consentAccepted: formState.termsAccepted && event.target.checked && formState.publicContactConsent })} />
                  Susipazinau su privatumo politika.
                </span>
              </label>
              <label>
                <span>
                  <input type="checkbox" checked={formState.publicContactConsent} onChange={(event) => setFormState({ ...formState, publicContactConsent: event.target.checked, consentAccepted: formState.termsAccepted && formState.privacyAcknowledged && event.target.checked })} />
                  Sutinku, kad po patvirtinimo profilyje viesai butu rodomi mano pasirinkti kontaktai.
                </span>
              </label>
              <label>
                <span>
                  <input type="checkbox" checked={formState.marketingConsent} onChange={(event) => setFormState({ ...formState, marketingConsent: event.target.checked })} />
                  Sutinku gauti neprivalomus LocalPro naujienu ir pasiulymu pranesimus.
                </span>
              </label>
              <label>
                <span>
                  <input type="checkbox" checked={formState.whatsappCommunicationConsent} onChange={(event) => setFormState({ ...formState, whatsappCommunicationConsent: event.target.checked })} />
                  Sutinku, kad del registracijos klausimu su manimi butu susisiekta WhatsApp.
                </span>
              </label>
              <button type="submit">Siųsti registraciją</button>
              {submitMessage ? <p className={`status-message ${submitTone}`}>{submitMessage}</p> : null}
            </form>
            )}

            <aside className="registration-preview" aria-label="Registracijos peržiūra">
              <p className="eyebrow">Profilio peržiūra</p>
              <div className="preview-card">
                <h3>{formState.name || "Naujas LocalPro specialistas"}</h3>
                <div className="tag-row">
                  {selectedCategoryNames.length ? selectedCategoryNames.map((name) => <span className="tag" key={name}>{name}</span>) : <span className="tag">Pasirinkite sritį</span>}
                  {formState.subcategorySlugs.length ? formState.subcategorySlugs.map((slug) => {
                    const subcategory = selectedSubcategories.find((item) => item.slug === slug);
                    return <span className="tag" key={slug}>{subcategory?.name ?? slug}</span>;
                  }) : null}
                  <span className="tag">{formState.town || formState.address || "Pagrindinė darbo vieta"}</span>
                  <span className="tag">{formatTravelRange(formState.radiusKm)}</span>
                  <span className="tag">Laukia patikros</span>
                </div>
                <p>{formState.description || "Trumpas darbų aprašymas bus rodomas čia."}</p>
                {formState.photoUploads.length || formState.photoUrls.filter(Boolean).length ? (
                  <div className="verification-list">
                    {formState.photoUploads.map((photo) => <span key={photo.name}>{photo.name}</span>)}
                    {formState.photoUrls.filter(Boolean).map((url, index) => <span key={`${url}-${index}`}>{formatPhotoUrl(url)}</span>)}
                  </div>
                ) : null}
                <div className="contact-list">
                  <a href={`tel:${formState.phone.replaceAll(" ", "")}`}><span>Telefonas</span><strong>{formState.phone || "+370..."}</strong></a>
                  <a href={`mailto:${formState.email}`}><span>El. paštas</span><strong>{formState.email || "vardas@example.lt"}</strong></a>
                </div>
              </div>
              <div className="approval-flow" aria-label="Publikavimo eiga">
                <span>1. Užpildote formą</span>
                <span>2. Saugome kaip laukiantį</span>
                <span>3. Admin patikrina profilį</span>
                <span>4. Rodome žemėlapyje</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="how-section" id="how">
          <div className="section-heading">
            <p className="eyebrow">Kaip veikia</p>
            <h2>Mažai rašymo, aiškus profilis, klientas susisiekia tiesiogiai.</h2>
          </div>
          <div className="workflow-grid">
            <div><strong>Registracija</strong><p>Specialistas užpildo formą, pasirenka darbo sritis, miestą ir kontaktus.</p></div>
            <div><strong>Laukia patikros</strong><p>Profilis saugomas kaip laukiantis su sutikimu ir aptarnaujamomis vietomis.</p></div>
            <div><strong>Admin patikra</strong><p>Publikuojame tik po patvirtinimo. Jei trūksta informacijos, profilį galima pataisyti administravime.</p></div>
            <div><strong>Kontaktas</strong><p>Klientas mato darbo zoną ir pats susisiekia telefonu arba per WhatsApp.</p></div>
          </div>
        </section>
        <footer className="site-footer">
          <a href="/privacy">Privatumo politika</a>
          <a href="/terms">Naudojimosi salygos</a>
          <span>Teisinis tekstas yra juodrastis ir turi buti perziuretas specialisto.</span>
        </footer>
      </main>
    </div>
  );
}

function logEnquiry(specialistId: string, eventType: "phone_click" | "whatsapp_click") {
  fetch("/api/enquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ specialistId, eventType })
  }).catch(() => undefined);
}

type MapMarkerItem =
  | {
      type: "cluster";
      id: string;
      count: number;
      lat: number;
      lng: number;
      points: DisplayMarkerPoint[];
    }
  | {
      type: "specialist";
      id: string;
      lat: number;
      lng: number;
      specialist: Specialist;
    };

type DisplayMarkerPoint = {
  specialist: Specialist;
  lat: number;
  lng: number;
};

function createMapMarkerItems(specialists: Specialist[], map: import("leaflet").Map): MapMarkerItem[] {
  const zoom = map.getZoom();
  const cellSize = zoom >= 12 ? 44 : zoom >= 9 ? 64 : zoom >= 8 ? 150 : 220;
  const groups = new Map<string, DisplayMarkerPoint[]>();

  spreadDuplicateCoordinates(specialists, map).forEach((markerPoint) => {
    const point = map.project([markerPoint.lat, markerPoint.lng], zoom);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    groups.set(key, [...(groups.get(key) ?? []), markerPoint]);
  });

  return Array.from(groups.entries()).map(([id, points]): MapMarkerItem => {
    if (points.length === 1) {
      return { type: "specialist", id: points[0].specialist.id, lat: points[0].lat, lng: points[0].lng, specialist: points[0].specialist };
    }

    const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;

    return {
      type: "cluster",
      id,
      count: points.length,
      lat,
      lng,
      points
    };
  });
}

function spreadDuplicateCoordinates(specialists: Specialist[], map: import("leaflet").Map): DisplayMarkerPoint[] {
  const zoom = map.getZoom();
  const groups = new Map<string, Specialist[]>();

  specialists.forEach((specialist) => {
    const key = `${specialist.lat.toFixed(5)}:${specialist.lng.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), specialist]);
  });

  return Array.from(groups.values()).flatMap((group) => {
    if (group.length === 1 || zoom < 12) {
      return group.map((specialist) => ({ specialist, lat: specialist.lat, lng: specialist.lng }));
    }

    const radius = group.length === 2 ? 42 : 54;
    const basePoint = map.project([group[0].lat, group[0].lng], zoom);

    return group.map((specialist, index) => {
      const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
      const displayPoint = map.unproject([basePoint.x + Math.cos(angle) * radius, basePoint.y + Math.sin(angle) * radius], zoom);
      return {
        specialist,
        lat: displayPoint.lat,
        lng: displayPoint.lng
      };
    });
  });
}

// Kept as a fallback if we return to Leaflet popups; the primary mobile flow now uses the bottom card.
function createMapPopup(specialist: Specialist) {
  const imageUrl = specialist.photoUrls?.find(Boolean);
  const thumbnail = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${specialist.name} darbų nuotrauka`)}" loading="lazy" />`
    : `<span class="map-popup-thumb-fallback">${escapeHtml(specialist.trade.charAt(0))}</span>`;
  const rating = specialist.rating ? `${specialist.rating.toFixed(1)} ★` : "Naujas";
  const whatsapp = specialist.whatsapp.replace(/[^\d]/g, "");

  return `
    <div class="map-popup">
      <div class="map-popup-main">
        <div class="map-popup-thumb">${thumbnail}</div>
        <div>
          <strong>${escapeHtml(specialist.companyName || specialist.name)}</strong>
          <span>${escapeHtml(specialist.trade)}</span>
          <span>${escapeHtml(specialist.serviceArea || specialist.operatingCities.join(", "))}</span>
        </div>
      </div>
      <div class="map-popup-meta">
        <span>${escapeHtml(rating)} / ${escapeHtml(formatReviewCount(specialist.reviewCount))}</span>
        <span>${escapeHtml(formatVerificationSummary(specialist.verification))}</span>
      </div>
      <div class="map-popup-actions">
        <a href="#profile">Peržiūrėti profilį</a>
        <a href="https://wa.me/${escapeHtml(whatsapp)}" target="_blank" rel="noreferrer">Siųsti užklausą</a>
      </div>
    </div>
  `;
}

function createClusterPopup(specialists: Specialist[]) {
  const items = specialists
    .map(
      (specialist) => `
        <li>
          <strong>${escapeHtml(specialist.companyName || specialist.name)}</strong>
          <span>${escapeHtml(specialist.trade)} / ${escapeHtml(specialist.serviceArea || specialist.operatingCities.join(", "))}</span>
          <a href="https://wa.me/${escapeHtml(specialist.whatsapp.replace(/[^\d]/g, ""))}" target="_blank" rel="noreferrer">Siųsti užklausą</a>
        </li>
      `
    )
    .join("");

  return `
    <div class="map-popup map-cluster-popup">
      <strong>${escapeHtml(formatSpecialistCount(specialists.length))} šioje vietoje</strong>
      <ul>${items}</ul>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serviceLabel(categories: Category[], slug: string) {
  for (const category of categories) {
    if (category.slug === slug) {
      return category.name;
    }

    const subcategory = category.subcategories.find((item) => item.slug === slug);
    if (subcategory) {
      return subcategory.name;
    }
  }

  return slug;
}

async function loadGooglePlacesLibrary() {
  await loadGooglePlacesScript();
  return window.google?.maps?.importLibrary("places") ?? Promise.reject(new Error("Google Places API is not available."));
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function loadGooglePlacesScript() {
  if (!googlePlacesApiKey) {
    return Promise.reject(new Error("Google Places API key is not configured."));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve();
  }

  if (googlePlacesScriptPromise) {
    return googlePlacesScriptPromise;
  }

  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (window[googlePlacesCallbackName] === handleReady) {
        delete window[googlePlacesCallbackName];
      }
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
    const timeoutId = window.setTimeout(() => {
      rejectWith(new Error("Google Places timed out before the Google callback fired."));
    }, googlePlacesScriptTimeoutMs);

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

function formatTravelRange(radiusKm: number) {
  return radiusKm >= 150 ? "Visa Lietuva" : `Iki ${radiusKm} km`;
}

function formatAvailability(specialist: Specialist) {
  return specialist.isAvailableSoon ? "Gali greitai pradėti" : "Dėl laiko susitarti";
}

function formatPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    const path = `${url.hostname}${url.pathname}`.replace(/^www\./, "");
    return path.length > 32 ? `${path.slice(0, 29)}...` : path;
  } catch {
    return value.length > 32 ? `${value.slice(0, 29)}...` : value;
  }
}

function formatRegistrationError(data: RegistrationErrorResponse) {
  const fieldErrors = data.details?.fieldErrors ?? {};
  const messages = Object.entries(fieldErrors)
    .flatMap(([field, errors]) =>
      (errors ?? []).map((error) => {
        const label = registrationFieldLabels[field] ?? field;
        return `Patikrinkite ${label}: ${translateValidationError(error)}`;
      })
    )
    .slice(0, 4);

  if (messages.length) {
    return messages.join(" ");
  }

  const formError = data.details?.formErrors?.[0];
  return formError ? translateValidationError(formError) : data.error ?? "Registracijos išsaugoti nepavyko.";
}

function translateValidationError(error: string) {
  if (/required|invalid_type/i.test(error)) {
    return "šis laukas privalomas.";
  }

  if (/invalid email|email/i.test(error)) {
    return "įveskite teisingą el. pašto adresą.";
  }

  if (/invalid url|url/i.test(error)) {
    return "įveskite teisingą nuotraukos nuorodą arba palikite lauką tuščią.";
  }

  if (/too_small|at least|minimum|min/i.test(error)) {
    return "įvesta per mažai informacijos.";
  }

  if (/too_big|at most|maximum|max/i.test(error)) {
    return "įvesta per daug informacijos arba failas per didelis.";
  }

  return error;
}
