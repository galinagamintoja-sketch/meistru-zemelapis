export type ProfileStatus = "pending" | "approved" | "rejected" | "suspended";
export type ProfileSource = "self-registration" | "whatsapp-onboarding" | "admin-created" | "imported-lead";

export type Specialist = {
  id: string;
  name: string;
  companyName?: string | null;
  trade: string;
  categorySlug: string;
  categorySlugs?: string[];
  categoryNames?: string[];
  publicStatus?: "public" | "private" | string;
  subcategorySlugs: string[];
  subcategoryNames?: string[];
  town: string;
  district?: string;
  streetArea?: string;
  approximateLocation?: string;
  operatingCities: string[];
  radius: number;
  lat: number;
  lng: number;
  registeredLat?: number;
  registeredLng?: number;
  distanceKm?: number;
  isAvailableSoon?: boolean;
  verification: string[];
  verificationLabel: string;
  rating: number;
  reviewCount: number;
  color: string;
  phone: string;
  email: string;
  whatsapp: string;
  serviceArea: string;
  description: string;
  photos: string[];
  photoUrls?: string[];
  photoRecords?: Array<{
    id: string;
    url: string;
    label?: string | null;
    moderationStatus: "pending" | "approved" | "rejected";
  }>;
  reviews: Array<[string, number, string]>;
  status: ProfileStatus;
  source: ProfileSource;
  isDemo?: boolean;
  publicContactConsentAt?: string | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  subcategories: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
};

export type RegistrationPayload = {
  name: string;
  phone: string;
  email: string;
  address: string;
  placeId?: string;
  latitude?: number | null;
  longitude?: number | null;
  city?: string;
  town: string;
  street: string;
  postcode: string;
  houseNumber?: string;
  trade: string;
  categorySlugs?: string[];
  subcategorySlugs?: string[];
  description: string;
  radiusKm: number;
  travelRange: "10" | "25" | "50" | "100" | "lt";
  operatingCities?: string[];
  photoUrls?: string[];
  photoUploads?: Array<{
    name: string;
    type: "image/jpeg" | "image/png" | "image/webp";
    size: number;
    dataUrl: string;
  }>;
  whatsapp?: string;
  consentAccepted: boolean;
  termsAccepted?: boolean;
  privacyAcknowledged?: boolean;
  publicContactConsent?: boolean;
  marketingConsent?: boolean;
  whatsappCommunicationConsent?: boolean;
};
