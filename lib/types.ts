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
  operatingCities: string[];
  radius: number;
  lat: number;
  lng: number;
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
  reviews: Array<[string, number, string]>;
  status: ProfileStatus;
  source: ProfileSource;
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
  city: string;
  trade: string;
  categorySlugs?: string[];
  subcategorySlugs?: string[];
  description: string;
  radiusKm: number;
  operatingCities: string[];
  photoUrls?: string[];
  photoUploads?: Array<{
    name: string;
    type: "image/jpeg" | "image/png" | "image/webp";
    size: number;
    dataUrl: string;
  }>;
  whatsapp?: string;
  consentAccepted: boolean;
};
