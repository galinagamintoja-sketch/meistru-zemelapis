"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import type { Category, Specialist } from "../../lib/types";
import { isLithuanianPhone, normalizeLithuanianPhone } from "../../lib/phone";

type StatusFilter = "pending" | "approved" | "rejected" | "suspended" | "all";
type EditDraft = {
  name: string;
  companyName: string;
  phone: string;
  whatsapp: string;
  email: string;
  categorySlugs: string[];
  subcategorySlugs: string[];
  photoUrls: string[];
  town: string;
  operatingCities: string;
  radius: string;
  serviceArea: string;
  description: string;
};
type AddDraft = {
  name: string;
  phone: string;
  categorySlugs: string[];
  subcategorySlugs: string[];
  photoUrls: string[];
  city: string;
  operatingCities: string;
  email: string;
  whatsapp: string;
  description: string;
  radius: string;
  source: string;
};
type ConsentDraft = {
  channel: "website" | "whatsapp" | "telephone" | "written_form";
  consentText: string;
  capturedAt: string;
  evidenceReference: string;
};
type SelectedPhoto = { id: string; file: File; previewUrl: string };
type JobRequest = {
  id: string; client_name: string; client_phone?: string | null; client_email?: string | null;
  source_city: string; source_service: string; source_address: string; message: string;
  urgency: string; preferred_contact_method: string; privacy_consent_at: string; created_at: string;
  enquiry_photos?: Array<{ id: string; original_name?: string | null; preview_url?: string | null }>;
};

const statuses: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Laukiantys" },
  { value: "approved", label: "Patvirtinti" },
  { value: "rejected", label: "Atmesti" },
  { value: "suspended", label: "Sustabdyti" },
  { value: "all", label: "Visi" }
];
const profileSources = [
  { value: "admin-created", label: "Sukūrė administratorius" },
  { value: "self-registration", label: "Savarankiška registracija" },
  { value: "imported-lead", label: "Importuotas kontaktas" }
];
const emptyAddDraft: AddDraft = {
  name: "",
  phone: "",
  categorySlugs: [],
  subcategorySlugs: [],
  photoUrls: [""],
  city: "",
  operatingCities: "",
  email: "",
  whatsapp: "",
  description: "",
  radius: "30",
  source: "admin-created"
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [profiles, setProfiles] = useState<Specialist[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [consentDrafts, setConsentDrafts] = useState<Record<string, ConsentDraft>>({});
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyAddDraft);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [section, setSection] = useState<"requests" | "specialists" | "add">("specialists");
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, SelectedPhoto[]>>({});
  const [addSelectedPhotos, setAddSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [addSucceeded, setAddSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [jobRequests, setJobRequests] = useState<JobRequest[]>([]);
  const nextLoadMessageRef = useRef<string | null>(null);
  const pendingActionKeysRef = useRef(new Set<string>());

  async function withPendingAction<T>(key: string, task: () => Promise<T>) {
    if (pendingActionKeysRef.current.has(key)) return undefined;
    pendingActionKeysRef.current.add(key);
    setPendingActions((current) => ({ ...current, [key]: true }));
    try {
      return await task();
    } finally {
      pendingActionKeysRef.current.delete(key);
      setPendingActions((current) => ({ ...current, [key]: false }));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAdmin(false);
    setProfiles([]);
    setDrafts({});
    setMessage("Atsijungta.");
  }

  async function checkSession() {
    setIsLoading(true);
    setMessage("Tikrinama administratoriaus prieiga...");

    try {
      const response = await fetch("/api/auth/session");
      const data = await response.json();
      if (!data.isAdmin) {
        setIsAdmin(false);
        setMessage(data.user ? "Jūsų Google paskyra nėra administratorių sąraše." : "Prisijunkite su administratoriaus Google paskyra.");
        return;
      }

      setIsAdmin(true);
      setMessage("Administratoriaus prieiga patvirtinta.");
    } catch {
      setMessage("Nepavyko patikrinti administratoriaus prieigos.");
    } finally {
      setIsLoading(false);
      setSessionChecked(true);
    }
  }

  async function loadProfiles() {
    if (!isAdmin) {
      return;
    }

    setIsLoading(true);
    setMessage("Įkeliami profiliai...");

    try {
      const response = await fetch(`/api/admin/profiles?status=${status}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setIsAdmin(false);
          setProfiles([]);
          setDrafts({});
        }
        setMessage(data.error ?? "Nepavyko įkelti profilių.");
        return;
      }

      const nextProfiles: Specialist[] = data.profiles ?? [];
      setProfiles(nextProfiles);
      setDrafts(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profileToDraft(profile)])));
      setConsentDrafts((current) => Object.fromEntries(nextProfiles.map((profile) => [profile.id, current[profile.id] ?? emptyConsentDraft()])));
      setNoteDrafts((current) => Object.fromEntries(nextProfiles.map((profile) => [profile.id, current[profile.id] ?? ""])));
      setMessage(nextLoadMessageRef.current ?? profilesLoadedMessage(nextProfiles.length, data.mode));
      nextLoadMessageRef.current = null;
    } catch {
      setMessage("Nepavyko įkelti profilių.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCategories() {
    const response = await fetch("/api/categories");
    const data = await response.json();
    setCategories(data.categories ?? []);
  }

  async function loadJobRequests() {
    if (!isAdmin) return;
    const response = await fetch("/api/admin/job-requests");
    const data = await response.json();
    if (response.ok) setJobRequests(data.requests ?? []);
  }

  async function runAction(id: string, action: "approve" | "reject" | "suspend" | "return_pending") {
    if ((action === "reject" || action === "suspend") && !confirm("Patvirtinkite: profilis bus paslėptas viešai.")) {
      return;
    }

    const key = `${id}:${action}`;
    const label = action === "approve" ? "Tvirtinama" : action === "reject" ? "Atmetama" : action === "suspend" ? "Stabdoma" : "Grąžinama patikrai";
    await withPendingAction(key, async () => {
      setMessage(`${label}...`);
      try {
        const { response, data } = await adminJsonRequest("/api/admin/profiles", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, action })
        });
        if (!response.ok) {
          setMessage([data.error ?? `${label} nepavyko.`, ...(data.validationErrors ?? [])].join(" "));
          return;
        }

        const verification = await adminJsonRequest("/api/admin/profiles?status=all");
        const profile = (verification.data.profiles ?? []).find((item: Specialist) => item.id === id);
        const expected = action === "approve"
          ? profile?.status === "approved" && profile?.publicStatus === "public"
          : action === "return_pending"
            ? profile?.status === "pending" && profile?.publicStatus === "private"
            : action === "reject"
              ? profile?.status === "rejected" && profile?.publicStatus === "private"
              : profile?.status === "suspended" && profile?.publicStatus === "private";
        if (!verification.response.ok || !expected) throw new Error("Serveris nepatvirtino naujos profilio būsenos.");

        nextLoadMessageRef.current = action === "approve"
          ? "Profilis patvirtintas ir publikuotas."
          : action === "return_pending"
            ? "Profilis grąžintas patikrai ir paslėptas."
            : action === "reject"
              ? "Profilis atmestas ir paslėptas."
              : "Profilis sustabdytas ir paslėptas.";
        await loadProfiles();
      } catch (error) {
        setMessage(adminActionErrorMessage(error, `${label} nepavyko.`));
      }
    });
  }

  async function moderatePhoto(profileId: string, photoId: string, moderationStatus: "approved" | "rejected") {
    if (moderationStatus === "rejected" && !confirm("Atmesta nuotrauka bus pašalinta iš viešo profilio.")) {
      return;
    }

    const key = `${profileId}:photo:${photoId}`;
    await withPendingAction(key, async () => {
      setMessage(moderationStatus === "approved" ? "Nuotrauka tvirtinama..." : "Nuotrauka atmetama...");
      try {
        const { response, data } = await adminJsonRequest("/api/admin/profiles", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: profileId, action: "moderate_photo", photoId, moderationStatus })
        });
        if (!response.ok) { setMessage(data.error ?? "Nuotraukos būsenos pakeisti nepavyko."); return; }
        nextLoadMessageRef.current = moderationStatus === "approved" ? "Nuotrauka patvirtinta." : "Nuotrauka atmesta.";
        await loadProfiles();
      } catch (error) {
        setMessage(adminActionErrorMessage(error, "Nuotraukos būsenos pakeisti nepavyko."));
      }
    });
  }

  function selectPhotos(profileId: string | "add", event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const profile = profileId === "add" ? undefined : profiles.find((item) => item.id === profileId);
    const currentCount = profile?.photoRecords?.filter((photo) => !photo.removedAt).length ?? 0;
    const alreadySelected = profileId === "add" ? addSelectedPhotos : selectedPhotos[profileId] ?? [];
    if (!files.length) return;
    if (currentCount + alreadySelected.length + files.length > 8) {
      setMessage("Galima turėti daugiausia 8 nuotraukas.");
      return;
    }
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (files.some((file) => !allowed.has(file.type) || file.size > 5 * 1024 * 1024)) {
      setMessage("Rinkitės JPG, PNG arba WebP failus, iki 5 MB kiekvieną.");
      return;
    }
    const next = files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) }));
    if (profileId === "add") setAddSelectedPhotos((current) => [...current, ...next]);
    else setSelectedPhotos((current) => ({ ...current, [profileId]: [...(current[profileId] ?? []), ...next] }));
    setMessage(`${next.length} nuotraukos paruoštos. Patvirtinkite įkėlimą.`);
  }

  function removeSelectedPhoto(profileId: string | "add", photoId: string) {
    const without = (items: SelectedPhoto[]) => {
      const removed = items.find((item) => item.id === photoId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return items.filter((item) => item.id !== photoId);
    };
    if (profileId === "add") setAddSelectedPhotos(without);
    else setSelectedPhotos((current) => ({ ...current, [profileId]: without(current[profileId] ?? []) }));
  }

  async function uploadSelectedPhotos(profileId: string, files: SelectedPhoto[]) {
    if (!files.length) return;
    const key = `${profileId}:upload`;
    await withPendingAction(key, async () => {
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index].file;
          const prepared = await adminJsonRequest("/api/admin/profiles", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: profileId, action: "create_photo_upload", photo: { name: file.name, type: file.type, size: file.size } })
          });
          if (!prepared.response.ok) throw new Error(prepared.data.error ?? "Nuotraukos įkelti nepavyko.");
          const signedUrl = String(prepared.data.signedUrl ?? "");
          const storagePath = String(prepared.data.storagePath ?? "");
          if (!signedUrl || !storagePath) throw new Error("Serveris negrąžino įkėlimo duomenų.");
          try {
            await directUpload(signedUrl, file, (percent) => {
              setUploadProgress((current) => ({ ...current, [profileId]: Math.round(((index + percent / 100) / files.length) * 100) }));
            });
            const finalized = await adminJsonRequest("/api/admin/profiles", {
              method: "PATCH", headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: profileId, action: "finalize_photo_upload", storagePath, name: file.name })
            });
            if (!finalized.response.ok) throw new Error(finalized.data.error ?? "Nuotraukos įrašo išsaugoti nepavyko.");
          } catch (error) {
            await adminJsonRequest("/api/admin/profiles", {
              method: "PATCH", headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: profileId, action: "abort_photo_upload", storagePath })
            });
            throw error;
          }
        }
        setUploadProgress((current) => ({ ...current, [profileId]: 100 }));
        files.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setSelectedPhotos((current) => ({ ...current, [profileId]: [] }));
        nextLoadMessageRef.current = "Nuotraukos įkeltos privačiai ir laukia patvirtinimo.";
        await loadProfiles();
      } catch (error) {
        setMessage(adminActionErrorMessage(error, "Nuotraukų įkelti nepavyko."));
      } finally {
        setUploadProgress((current) => {
          const next = { ...current };
          delete next[profileId];
          return next;
        });
      }
    });
  }

  async function removePhoto(profileId: string, photoId: string) {
    if (!confirm("Pašalinti šią nuotrauką iš profilio?")) return;
    const { response, data } = await adminJsonRequest("/api/admin/profiles", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: profileId, action: "remove_photo", photoId })
    });
    if (!response.ok) { setMessage(data.error ?? "Nuotraukos pašalinti nepavyko."); return; }
    nextLoadMessageRef.current = "Nuotrauka pašalinta.";
    await loadProfiles();
  }

  async function movePhoto(profileId: string, photoId: string, direction: -1 | 1) {
    const records = profiles.find((item) => item.id === profileId)?.photoRecords?.filter((photo) => !photo.removedAt) ?? [];
    const index = records.findIndex((photo) => photo.id === photoId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= records.length) return;
    const ids = records.map((photo) => photo.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const { response, data } = await adminJsonRequest("/api/admin/profiles", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: profileId, action: "reorder_photos", photoIds: ids })
    });
    if (!response.ok) { setMessage(data.error ?? "Eiliškumo pakeisti nepavyko."); return; }
    nextLoadMessageRef.current = "Nuotraukų eiliškumas pakeistas.";
    await loadProfiles();
  }

  async function recordPublicContactConsent(profileId: string) {
    const draft = consentDrafts[profileId] ?? emptyConsentDraft();
    const key = `${profileId}:consent`;
    await withPendingAction(key, async () => {
      setMessage("Įrašomas viešų kontaktų sutikimas...");
      try {
        const { response, data } = await adminJsonRequest("/api/admin/profiles", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: profileId, action: "record_public_contact_consent", consentChannel: draft.channel, consentText: draft.consentText, capturedAt: draft.capturedAt, evidenceReference: draft.evidenceReference })
        });
        if (!response.ok) { setMessage(data.error ?? "Sutikimo įrašyti nepavyko."); return; }
        nextLoadMessageRef.current = "Viešų kontaktų sutikimas įrašytas.";
        await loadProfiles();
      } catch (error) {
        setMessage(adminActionErrorMessage(error, "Sutikimo įrašyti nepavyko."));
      }
    });
  }

  async function saveProfile(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    const phone = normalizeLithuanianPhone(draft.phone);
    const whatsapp = draft.whatsapp.trim() ? normalizeLithuanianPhone(draft.whatsapp) : "";
    if (!isLithuanianPhone(phone) || (whatsapp && !isLithuanianPhone(whatsapp))) {
      setPhoneErrors((current) => ({
        ...current,
        [`${id}:phone`]: isLithuanianPhone(phone) ? "" : "Įveskite lietuvišką numerį, pvz. 063601230 arba +37063601230.",
        [`${id}:whatsapp`]: !whatsapp || isLithuanianPhone(whatsapp) ? "" : "Įveskite galiojantį lietuvišką WhatsApp numerį."
      }));
      setMessage("Patikrinkite telefono numerius.");
      return;
    }
    setDrafts((current) => ({ ...current, [id]: { ...draft, phone, whatsapp } }));

    const key = `${id}:save`;
    await withPendingAction(key, async () => {
      setMessage("Saugomi profilio pakeitimai...");
      try {
        const { response, data } = await adminJsonRequest("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id,
        action: "update",
        profile: {
          name: draft.name,
          companyName: draft.companyName,
          phone,
          whatsapp,
          email: draft.email,
          categorySlug: draft.categorySlugs[0] ?? "",
          categorySlugs: draft.categorySlugs,
          subcategorySlugs: draft.subcategorySlugs,
          photoUrls: draft.photoUrls.map((url) => url.trim()).filter(Boolean),
          town: draft.town,
          operatingCities: splitList(draft.operatingCities),
          radius: Number(draft.radius),
          serviceArea: draft.serviceArea,
          description: draft.description
        }
      })
        });
        if (!response.ok) { setMessage(data.error ?? "Išsaugoti nepavyko."); return; }
        nextLoadMessageRef.current = "Profilio pakeitimai išsaugoti.";
        await loadProfiles();
      } catch (error) {
        setMessage(adminActionErrorMessage(error, "Išsaugoti nepavyko."));
      }
    });
  }

  async function addTradesperson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = normalizeLithuanianPhone(addDraft.phone);
    const whatsapp = addDraft.whatsapp.trim() ? normalizeLithuanianPhone(addDraft.whatsapp) : "";
    if (!isLithuanianPhone(phone) || (whatsapp && !isLithuanianPhone(whatsapp))) {
      setPhoneErrors((current) => ({
        ...current,
        "add:phone": isLithuanianPhone(phone) ? "" : "Įveskite lietuvišką numerį, pvz. 063601230 arba +37063601230.",
        "add:whatsapp": !whatsapp || isLithuanianPhone(whatsapp) ? "" : "Įveskite galiojantį lietuvišką WhatsApp numerį."
      }));
      setMessage("Patikrinkite telefono numerius.");
      return;
    }
    setAddDraft((current) => ({ ...current, phone, whatsapp }));
    setPendingActions((current) => ({ ...current, add: true }));
    setMessage("Pridedamas specialistas...");
    setAddSucceeded(false);

    const response = await fetch("/api/admin/profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: addDraft.name,
        phone,
        categorySlug: addDraft.categorySlugs[0] ?? "",
        categorySlugs: addDraft.categorySlugs,
        subcategorySlugs: addDraft.subcategorySlugs,
        photoUrls: addDraft.photoUrls.map((url) => url.trim()).filter(Boolean),
        city: addDraft.city,
        operatingCities: splitList(addDraft.operatingCities || addDraft.city),
        email: addDraft.email,
        whatsapp,
        description: addDraft.description,
        radius: Number(addDraft.radius),
        source: addDraft.source
      })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Specialisto pridėti nepavyko.");
      setPendingActions((current) => ({ ...current, add: false }));
      return;
    }

    if (addSelectedPhotos.length && data.profile?.id) {
      await uploadSelectedPhotos(data.profile.id, addSelectedPhotos);
      addSelectedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setAddSelectedPhotos([]);
    }
    setAddSucceeded(true);
    setAddDraft(emptyAddDraft);
    nextLoadMessageRef.current = "Specialistas pridėtas.";
    if (status === "pending") {
      await loadProfiles();
    } else {
      setStatus("pending");
    }
    setPendingActions((current) => ({ ...current, add: false }));
  }

  async function addAdminNote(profileId: string) {
    const notes = noteDrafts[profileId]?.trim() ?? "";
    setPendingActions((current) => ({ ...current, [`${profileId}:note`]: true }));
    setMessage("Įrašoma administratoriaus pastaba...");

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: profileId, action: "admin_note", notes })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Pastabos įrašyti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${profileId}:note`]: false }));
      return;
    }

    setNoteDrafts((current) => ({ ...current, [profileId]: "" }));
    nextLoadMessageRef.current = "Administratoriaus pastaba įrašyta.";
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${profileId}:note`]: false }));
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string | string[]) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const nextDraft: EditDraft = {
        ...draft,
        [field]: value
      } as EditDraft;

      if (field === "categorySlugs" && Array.isArray(value)) {
        const allowedSubcategories = new Set(selectedSubcategories(categories, value).map((subcategory) => subcategory.slug));
        nextDraft.subcategorySlugs = draft.subcategorySlugs.filter((slug) => allowedSubcategories.has(slug));
      }

      return {
        ...current,
        [id]: nextDraft
      };
    });
  }

  function updateAddDraft(field: keyof AddDraft, value: string | string[]) {
    setAddDraft((current) => {
      const nextDraft: AddDraft = {
        ...current,
        [field]: value
      } as AddDraft;

      if (field === "categorySlugs" && Array.isArray(value)) {
        const allowedSubcategories = new Set(selectedSubcategories(categories, value).map((subcategory) => subcategory.slug));
        nextDraft.subcategorySlugs = current.subcategorySlugs.filter((slug) => allowedSubcategories.has(slug));
      }

      return nextDraft;
    });
    setAddSucceeded(false);
  }

  function normalizeAdminPhoneField(key: string, value: string, onValid: (normalized: string) => void, optional = false) {
    if (optional && !value.trim()) {
      setPhoneErrors((current) => ({ ...current, [key]: "" }));
      onValid("");
      return;
    }
    const normalized = normalizeLithuanianPhone(value);
    if (isLithuanianPhone(normalized)) {
      onValid(normalized);
      setPhoneErrors((current) => ({ ...current, [key]: "" }));
      return;
    }
    setPhoneErrors((current) => ({ ...current, [key]: "Įveskite lietuvišką numerį, pvz. 063601230 arba +37063601230." }));
  }

  function updateConsentDraft(id: string, field: keyof ConsentDraft, value: string) {
    setConsentDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyConsentDraft()),
        [field]: value
      }
    }));
  }

  function updateDraftPhotoUrl(id: string, index: number, value: string) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const photoUrls = [...draft.photoUrls];
      photoUrls[index] = value;
      return { ...current, [id]: { ...draft, photoUrls } };
    });
  }

  function updateAddPhotoUrl(index: number, value: string) {
    setAddDraft((current) => {
      const photoUrls = [...current.photoUrls];
      photoUrls[index] = value;
      return { ...current, photoUrls };
    });
    setAddSucceeded(false);
  }

  function addDraftPhotoField(id: string) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft || draft.photoUrls.length >= 8) {
        return current;
      }

      return { ...current, [id]: { ...draft, photoUrls: [...draft.photoUrls, ""] } };
    });
  }

  function removeDraftPhotoField(id: string, index: number) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const next = draft.photoUrls.length > 1 ? draft.photoUrls.filter((_, currentIndex) => currentIndex !== index) : [""];
      return { ...current, [id]: { ...draft, photoUrls: next } };
    });
  }

  function addAddPhotoField() {
    setAddDraft((current) => ({
      ...current,
      photoUrls: current.photoUrls.length >= 8 ? current.photoUrls : [...current.photoUrls, ""]
    }));
    setAddSucceeded(false);
  }

  function removeAddPhotoField(index: number) {
    setAddDraft((current) => ({
      ...current,
      photoUrls: current.photoUrls.length > 1 ? current.photoUrls.filter((_, currentIndex) => currentIndex !== index) : [""]
    }));
    setAddSucceeded(false);
  }

  useEffect(() => {
    checkSession().catch(() => setMessage("Nepavyko patikrinti administratoriaus prieigos."));
    loadCategories().catch(() => setMessage("Nepavyko įkelti kategorijų."));
  }, []);

  useEffect(() => {
    loadProfiles();
    loadJobRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin]);

  const addAvailableSubcategories = selectedSubcategories(categories, addDraft.categorySlugs);

  if (!sessionChecked || !isAdmin) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <p className="eyebrow">LocalPro admin</p>
          <h1>Administratoriaus prisijungimas</h1>
          <p>Prisijunkite su Google paskyra, kuri yra administratorių sąraše.</p>
          <a className="primary-action" href="/login">Prisijungti su Google</a>
          <p className="admin-message">{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="section-heading admin-heading">
        <div>
          <p className="eyebrow">LocalPro admin</p>
          <h1>Profilių patikros skydelis</h1>
          <p>Peržiūrėkite registracijas, pataisykite duomenis ir patvirtinkite arba atmeskite profilius.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={logout}>
          Atsijungti
        </button>
      </section>

      <nav className="admin-tabs" aria-label="Administravimo skyriai">
        <button type="button" aria-current={section === "requests" ? "page" : undefined} onClick={() => setSection("requests")}>Užklausos</button>
        <button type="button" aria-current={section === "specialists" ? "page" : undefined} onClick={() => setSection("specialists")}>Meistrai</button>
        <button type="button" aria-current={section === "add" ? "page" : undefined} onClick={() => { setSection("add"); setIsAddOpen(true); }}>Pridėti meistrą</button>
      </nav>

      {section === "specialists" ? <div className="admin-toolbar">
        <label>
          Būsena
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadProfiles()} disabled={isLoading}>
          {isLoading ? "Kraunama..." : "Atnaujinti"}
        </button>
      </div> : null}

      <p className="admin-message">{message}</p>

      {section === "requests" ? <section className="admin-add-panel">
        <div className="admin-card-header"><div><p className="eyebrow">Namų savininkų užklausos</p><h2>Privačios darbų užklausos</h2><p>Matomos tik prisijungusiam administratoriui.</p></div><button className="admin-secondary" type="button" onClick={loadJobRequests}>Atnaujinti</button></div>
        <div className="admin-grid">{jobRequests.length ? jobRequests.map((item) => <article className="admin-card" key={item.id}>
          <div className="admin-card-header"><div><p className="eyebrow">{item.urgency} / {formatDateTime(item.created_at)}</p><h2>{item.client_name}</h2><p>{item.source_service} · {item.source_city}</p></div></div>
          <dl className="admin-summary"><div><dt>Adresas</dt><dd>{item.source_address}</dd></div><div><dt>Kontaktas</dt><dd>{item.preferred_contact_method}: {item.client_phone || item.client_email}</dd></div><div><dt>Nuotraukos</dt><dd>{item.enquiry_photos?.length ?? 0}</dd></div></dl>
          <p className="admin-description">{item.message}</p>
          {item.enquiry_photos?.length ? <div className="admin-meta">{item.enquiry_photos.map((photo) => photo.preview_url ? <a key={photo.id} href={photo.preview_url} target="_blank" rel="noreferrer">{photo.original_name || "Peržiūrėti nuotrauką"}</a> : <span key={photo.id}>Nuotraukos peržiūra nepasiekiama</span>)}</div> : null}
        </article>) : <p>Naujų darbų užklausų nėra.</p>}</div>
      </section> : null}

      {section === "add" && isAddOpen ? (
        <section className="admin-add-panel">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Rankinis profilis</p>
              <h2>Pridėti specialistą</h2>
              <p>Naujai administratoriaus sukurti profiliai lieka laukiantys ir privatūs, kol juos patvirtinsite.</p>
            </div>
            {addSucceeded ? (
              <button className="admin-secondary" type="button" onClick={() => {
                setAddDraft(emptyAddDraft);
                setAddSucceeded(false);
              }}>
                Pridėti dar vieną
              </button>
            ) : null}
          </div>

          <form className="admin-edit admin-add-form" onSubmit={addTradesperson}>
            <label>
              Vardas *
              <input required value={addDraft.name} onChange={(event) => updateAddDraft("name", event.target.value)} />
            </label>
            <label>
              Telefonas *
              <input
                required
                value={addDraft.phone}
                onChange={(event) => updateAddDraft("phone", event.target.value)}
                onBlur={() => normalizeAdminPhoneField("add:phone", addDraft.phone, (value) => updateAddDraft("phone", value))}
                aria-invalid={Boolean(phoneErrors["add:phone"])}
              />
              {phoneErrors["add:phone"] ? <span className="field-error">{phoneErrors["add:phone"]}</span> : null}
            </label>
            <label>
              Kategorijos *
              <select
                multiple
                size={Math.min(6, Math.max(3, categories.length))}
                required
                value={addDraft.categorySlugs}
                onChange={(event) =>
                  updateAddDraft(
                    "categorySlugs",
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  )
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subkategorijos
              <select
                multiple
                size={Math.min(8, Math.max(3, addAvailableSubcategories.length || 3))}
                value={addDraft.subcategorySlugs}
                onChange={(event) =>
                  updateAddDraft(
                    "subcategorySlugs",
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  )
                }
                disabled={!addAvailableSubcategories.length}
              >
                {addAvailableSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.slug}>
                    {subcategory.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Miestas *
              <input required value={addDraft.city} onChange={(event) => updateAddDraft("city", event.target.value)} />
            </label>
            <label>
              Aptarnavimo zona *
              <input
                required
                placeholder="Vilnius, Lentvaris"
                value={addDraft.operatingCities}
                onChange={(event) => updateAddDraft("operatingCities", event.target.value)}
              />
            </label>
            <label>
              Spindulys km
              <input value={addDraft.radius} onChange={(event) => updateAddDraft("radius", event.target.value)} inputMode="numeric" />
            </label>
            <label>
              El. paštas
              <input value={addDraft.email} onChange={(event) => updateAddDraft("email", event.target.value)} type="email" />
            </label>
            <label>
              WhatsApp
              <input
                value={addDraft.whatsapp}
                onChange={(event) => updateAddDraft("whatsapp", event.target.value)}
                onBlur={() => normalizeAdminPhoneField("add:whatsapp", addDraft.whatsapp, (value) => updateAddDraft("whatsapp", value), true)}
                aria-invalid={Boolean(phoneErrors["add:whatsapp"])}
              />
              {phoneErrors["add:whatsapp"] ? <span className="field-error">{phoneErrors["add:whatsapp"]}</span> : null}
            </label>
            <label>
              Šaltinis
              <select value={addDraft.source} onChange={(event) => updateAddDraft("source", event.target.value)}>
                {profileSources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-wide">
              Aprašymas
              <textarea value={addDraft.description} onChange={(event) => updateAddDraft("description", event.target.value)} rows={4} />
            </label>
            <fieldset className="admin-wide">
              <legend>Nuotraukos</legend>
              <label className="admin-upload-button">Pridėti nuotraukas
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => selectPhotos("add", event)} />
              </label>
              <SelectedPhotoPreviews photos={addSelectedPhotos} onRemove={(id) => removeSelectedPhoto("add", id)} />
              <p className="field-note">JPG, PNG arba WebP; iki 8 nuotraukų; iki 5 MB kiekviena. Nuotraukos bus įkeltos tik sukūrus privatų profilį.</p>
              <details className="admin-advanced"><summary>Išplėstiniai nustatymai: nuotraukų URL</summary>
              {addDraft.photoUrls.map((photoUrl, index) => (
                <div className="form-row" key={`add-photo-${index}`}>
                  <label>
                    Nuotraukos URL {index + 1}
                    <input
                      type="url"
                      placeholder="https://..."
                      value={photoUrl}
                      onChange={(event) => updateAddPhotoUrl(index, event.target.value)}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => removeAddPhotoField(index)}>
                    Pašalinti
                  </button>
                </div>
              ))}
              <button type="button" className="admin-secondary" onClick={addAddPhotoField} disabled={addDraft.photoUrls.length >= 8}>
                Pridėti URL
              </button>
              </details>
            </fieldset>
            <button type="submit" disabled={pendingActions.add}>Pridėti specialistą</button>
          </form>
        </section>
      ) : null}

      {section === "specialists" ? <section className="admin-grid admin-profile-list">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? profileToDraft(profile);
          const eligibility = publicationEligibility(profile);
          const canApprove = eligibility.filter((item) => !item.isState).every((item) => item.ok) && profile.status !== "approved";
          const approvedPhotos = profile.photoRecords?.filter((photo) => photo.moderationStatus === "approved" && !photo.removedAt) ?? [];
          const activePhotos = profile.photoRecords?.filter((photo) => !photo.removedAt) ?? [];

          return (
            <article className="admin-card" key={profile.id}>
              <div className="admin-card-header">
                <div>
                  <p className="eyebrow">{formatApprovalStatus(profile.status)} / {formatPublicStatus(profile)}</p>
                  <h2>{profile.name}</h2>
                  <p>{profile.trade} / {formatSubcategories(profile)}</p>
                </div>
                <button className="admin-secondary" type="button" onClick={() => setOpenProfileId((current) => current === profile.id ? null : profile.id)}>
                  {openProfileId === profile.id ? "Uždaryti" : "Peržiūrėti ir redaguoti"}
                </button>
                {openProfileId === profile.id ? <div className="admin-actions admin-context-actions">
                  {profile.status === "pending" && canApprove ? <button type="button" onClick={() => runAction(profile.id, "approve")} disabled={pendingActions[`${profile.id}:approve`]}>Tvirtinti</button> : null}
                  <button type="button" className="admin-secondary" onClick={() => saveProfile(profile.id)} disabled={pendingActions[`${profile.id}:save`]}>Išsaugoti</button>
                  {profile.status === "approved" ? <button type="button" onClick={() => runAction(profile.id, "return_pending")}>Paslėpti ir grąžinti patikrai</button> : null}
                  {profile.status === "rejected" || profile.status === "suspended" ? <button type="button" onClick={() => runAction(profile.id, "return_pending")}>Grąžinti patikrai</button> : null}
                  {profile.status === "pending" || profile.status === "approved" ? <details className="admin-overflow">
                    <summary aria-label="Daugiau veiksmų">⋮</summary>
                    <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "reject")} disabled={pendingActions[`${profile.id}:reject`]}>Atmesti</button>
                  </details> : null}
                </div> : null}
              </div>

              {openProfileId !== profile.id ? <dl className="admin-card-compact">
                <div><dt>Kategorija</dt><dd>{profile.trade || "-"}</dd></div>
                <div><dt>Miestas / zona</dt><dd>{profile.town || profile.operatingCities.join(", ") || "-"}</dd></div>
                <div><dt>Būsena</dt><dd>{formatApprovalStatus(profile.status)}</dd></div>
                <div><dt>Nuotraukos</dt><dd>{profile.photoRecords?.filter((photo) => !photo.removedAt).length ?? 0}</dd></div>
              </dl> : null}

              {openProfileId === profile.id ? <>

              <dl className="admin-summary">
                <div><dt>Vardas</dt><dd>{profile.name}</dd></div>
                <div><dt>Įmonė</dt><dd>{profile.companyName || "-"}</dd></div>
                <div><dt>Telefonas</dt><dd>{profile.phone}</dd></div>
                <div><dt>El. paštas</dt><dd>{profile.email}</dd></div>
                <div><dt>Kategorija</dt><dd>{profile.trade}</dd></div>
                <div><dt>Subkategorija</dt><dd>{formatSubcategories(profile, "-")}</dd></div>
                <div><dt>Miestas / zona</dt><dd>{profile.town} / {profile.operatingCities.join(", ")}</dd></div>
                <div><dt>Patikra</dt><dd>{profile.verificationLabel || "Laukiama"}</dd></div>
                <div><dt>Vieša būsena</dt><dd>{formatPublicStatus(profile)}</dd></div>
                <div><dt>Viešų kontaktų sutikimas</dt><dd>{profile.publicContactConsentAt ? formatDateTime(profile.publicContactConsentAt) : "Nėra"}</dd></div>
              </dl>

              <p className="admin-description">{profile.description || "Aprašymo dar nėra."}</p>

              {!canApprove && profile.status === "pending" ? <section className="admin-eligibility" aria-label="Ko trūksta patvirtinimui">
                <div>
                  <strong>Profilio dar negalima patvirtinti</strong>
                  <span>Atverkite pažymėtą skiltį ir papildykite trūkstamus duomenis.</span>
                </div>
                <ul>
                  {eligibility.filter((item) => !item.ok && !item.isState).map((item) => (
                    <li key={item.label} data-ok={item.ok ? "true" : "false"}>
                      <span aria-hidden="true">{item.ok ? "OK" : "!"}</span>
                      <a href={eligibilitySectionHref(profile.id, item.label)}>{item.label}</a>
                    </li>
                  ))}
                </ul>
              </section> : null}

              <details className="admin-consent-panel admin-edit-section" id={`admin-consents-${profile.id}`}>
                <summary>Sutikimai</summary>
                <p className="field-note">
                  Record this only after the specialist explicitly agreed that selected contact details may be displayed publicly.
                </p>
                <div className="admin-edit">
                  <label>
                    Sutikimo kanalas
                    <select
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).channel}
                      onChange={(event) => updateConsentDraft(profile.id, "channel", event.target.value)}
                    >
                      <option value="website">Website</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telephone">Telephone</option>
                      <option value="written_form">Written form</option>
                    </select>
                  </label>
                  <label>
                    Užfiksuota
                    <input
                      type="datetime-local"
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).capturedAt}
                      onChange={(event) => updateConsentDraft(profile.id, "capturedAt", event.target.value)}
                    />
                  </label>
                  <label className="admin-wide">
                    Sutikimo tekstas arba nuoroda į tekstą
                    <textarea
                      rows={3}
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).consentText}
                      onChange={(event) => updateConsentDraft(profile.id, "consentText", event.target.value)}
                    />
                  </label>
                  <label className="admin-wide">
                    Įrodymo / pokalbio nuoroda
                    <input
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).evidenceReference}
                      onChange={(event) => updateConsentDraft(profile.id, "evidenceReference", event.target.value)}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => recordPublicContactConsent(profile.id)}>
                    Įrašyti viešų kontaktų sutikimą
                  </button>
                </div>
              </details>

              <details className="admin-history admin-edit-section" aria-label="Vidinės pastabos ir auditas">
                <summary>Vidinės pastabos ir istorija</summary>
                <div className="admin-card-header">
                  <div>
                    <strong>Vidinės pastabos ir auditas</strong>
                    <p>Pastabos lieka tik administratoriaus skydelyje ir nėra grąžinamos viešai.</p>
                  </div>
                </div>
                <div className="admin-edit">
                  <label className="admin-wide">
                    Administratoriaus pastaba
                    <textarea
                      rows={3}
                      value={noteDrafts[profile.id] ?? ""}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [profile.id]: event.target.value }))}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => addAdminNote(profile.id)} disabled={pendingActions[`${profile.id}:note`]}>
                    Įrašyti pastabą
                  </button>
                </div>
                {profile.adminActions?.length ? (
                  <ul className="admin-audit-list">
                    {profile.adminActions.slice(0, 8).map((action) => (
                      <li key={action.id}>
                        <span>{formatDateTime(action.createdAt)}</span>
                        <strong>{formatActionType(action.action)}</strong>
                        {action.notes ? <em>{action.notes}</em> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-note">Audito veiksmų dar nėra.</p>
                )}
              </details>

              <details className="admin-edit-section">
                <summary>Pagrindinė informacija, paslaugos ir darbo zona</summary>
              <form className="admin-edit" id={`admin-main-${profile.id}`} onSubmit={(event) => {
                event.preventDefault();
                saveProfile(profile.id);
              }}>
                <label>
                  Vardas
                  <input value={draft.name} onChange={(event) => updateDraft(profile.id, "name", event.target.value)} />
                </label>
                <label>
                  Įmonės pavadinimas
                  <input value={draft.companyName} onChange={(event) => updateDraft(profile.id, "companyName", event.target.value)} />
                </label>
                <label>
                  Telefonas
                  <input
                    value={draft.phone}
                    onChange={(event) => updateDraft(profile.id, "phone", event.target.value)}
                    onBlur={() => normalizeAdminPhoneField(`${profile.id}:phone`, draft.phone, (value) => updateDraft(profile.id, "phone", value))}
                    aria-invalid={Boolean(phoneErrors[`${profile.id}:phone`])}
                  />
                  {phoneErrors[`${profile.id}:phone`] ? <span className="field-error">{phoneErrors[`${profile.id}:phone`]}</span> : null}
                </label>
                <label>
                  WhatsApp
                  <input
                    value={draft.whatsapp}
                    onChange={(event) => updateDraft(profile.id, "whatsapp", event.target.value)}
                    onBlur={() => normalizeAdminPhoneField(`${profile.id}:whatsapp`, draft.whatsapp, (value) => updateDraft(profile.id, "whatsapp", value), true)}
                    aria-invalid={Boolean(phoneErrors[`${profile.id}:whatsapp`])}
                  />
                  {phoneErrors[`${profile.id}:whatsapp`] ? <span className="field-error">{phoneErrors[`${profile.id}:whatsapp`]}</span> : null}
                </label>
                <label>
                  El. paštas
                  <input value={draft.email} onChange={(event) => updateDraft(profile.id, "email", event.target.value)} />
                </label>
                <label>
                  Kategorijos
                  <select
                    multiple
                    size={Math.min(6, Math.max(3, categories.length))}
                    value={draft.categorySlugs}
                    onChange={(event) =>
                      updateDraft(
                        profile.id,
                        "categorySlugs",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Subkategorijos
                  <select
                    multiple
                    size={Math.min(8, Math.max(3, selectedSubcategories(categories, draft.categorySlugs).length || 3))}
                    value={draft.subcategorySlugs}
                    onChange={(event) =>
                      updateDraft(
                        profile.id,
                        "subcategorySlugs",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                    disabled={!selectedSubcategories(categories, draft.categorySlugs).length}
                  >
                    {selectedSubcategories(categories, draft.categorySlugs).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.slug}>
                        {subcategory.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Miestas
                  <input value={draft.town} onChange={(event) => updateDraft(profile.id, "town", event.target.value)} />
                </label>
                <label>
                  Aptarnaujami miestai
                  <input value={draft.operatingCities} onChange={(event) => updateDraft(profile.id, "operatingCities", event.target.value)} />
                </label>
                <label>
                  Spindulys km
                  <input value={draft.radius} onChange={(event) => updateDraft(profile.id, "radius", event.target.value)} inputMode="numeric" />
                </label>
                <label className="admin-wide">
                  Aptarnavimo zonos pavadinimas
                  <input value={draft.serviceArea} onChange={(event) => updateDraft(profile.id, "serviceArea", event.target.value)} />
                </label>
                <label className="admin-wide">
                  Aprašymas
                  <textarea value={draft.description} onChange={(event) => updateDraft(profile.id, "description", event.target.value)} rows={4} />
                </label>
                <details className="admin-wide admin-edit-section" id={`admin-photos-${profile.id}`}>
                  <summary>Nuotraukos</summary>
                <fieldset>
                  <legend>Nuotraukos</legend>
                  <label className="admin-upload-button">
                    Pridėti nuotraukas
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => selectPhotos(profile.id, event)} />
                  </label>
                  <SelectedPhotoPreviews photos={selectedPhotos[profile.id] ?? []} onRemove={(id) => removeSelectedPhoto(profile.id, id)} />
                  {(selectedPhotos[profile.id]?.length ?? 0) > 0 ? <button type="button" onClick={() => uploadSelectedPhotos(profile.id, selectedPhotos[profile.id] ?? [])} disabled={pendingActions[`${profile.id}:upload`]}>Įkelti pasirinktas nuotraukas</button> : null}
                  {uploadProgress[profile.id] !== undefined ? <progress max="100" value={uploadProgress[profile.id]}>{uploadProgress[profile.id]}%</progress> : null}
                  <p className="field-note">JPG, PNG arba WebP; iki 8 aktyvių nuotraukų; iki 5 MB kiekviena.</p>
                  {approvedPhotos.length ? <div className="admin-main-photo"><img src={approvedPhotos[0].url} alt="" /><div><strong>Pagrindinė nuotrauka</strong><span>{formatPhotoStatus(approvedPhotos[0])}</span></div></div> : <p className="field-note">Patvirtintų viešų nuotraukų dar nėra.</p>}
                  {activePhotos.length ? (
                    <div className="admin-photo-moderation">
                      {activePhotos.map((photo, photoIndex) => (
                        <div className="admin-photo-row" key={photo.id}>
                          <img src={photo.url} alt={photo.label || "Profilio nuotrauka"} />
                          <div className="admin-photo-info"><strong>{photo.label || `Nuotrauka ${photoIndex + 1}`}</strong><span>{formatPhotoStatus(photo)}{approvedPhotos[0]?.id === photo.id ? " · pagrindinė" : ""}</span></div>
                          <details className="admin-photo-menu"><summary aria-label={`Atverti nuotraukos „${photo.label || `Nuotrauka ${photoIndex + 1}`}“ veiksmus`} aria-haspopup="menu">⋮</summary><div role="menu" aria-label="Nuotraukos veiksmai">
                            {photo.moderationStatus !== "approved" ? <button type="button" role="menuitem" onClick={() => moderatePhoto(profile.id, photo.id, "approved")}>Patvirtinti</button> : null}
                            {photo.moderationStatus !== "rejected" ? <button type="button" role="menuitem" onClick={() => moderatePhoto(profile.id, photo.id, "rejected")}>Atmesti</button> : null}
                            {photoIndex > 0 ? <button type="button" role="menuitem" onClick={() => movePhoto(profile.id, photo.id, -1)}>Perkelti aukštyn</button> : null}
                            {photoIndex < activePhotos.length - 1 ? <button type="button" role="menuitem" onClick={() => movePhoto(profile.id, photo.id, 1)}>Perkelti žemyn</button> : null}
                            <button type="button" role="menuitem" className="admin-danger" onClick={() => removePhoto(profile.id, photo.id)}>Pašalinti</button>
                          </div></details>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="field-note">Nuotraukų nėra. Profilis gali būti tvarkomas, bet viešai bus rodomas be darbų nuotraukų.</p>
                  )}
                  <details className="admin-advanced"><summary>Išplėstiniai nustatymai: nuotraukų URL</summary>{draft.photoUrls.map((photoUrl, index) => (
                    <div className="form-row" key={`photo-${profile.id}-${index}`}>
                      <label>
                        Nuotraukos URL {index + 1}
                        <input
                          type="url"
                          placeholder="https://..."
                          value={photoUrl}
                          onChange={(event) => updateDraftPhotoUrl(profile.id, index, event.target.value)}
                        />
                      </label>
                      <button type="button" className="admin-secondary" onClick={() => removeDraftPhotoField(profile.id, index)}>
                        Pašalinti
                      </button>
                    </div>
                  ))}</details>
                  <button type="button" className="admin-secondary" onClick={() => addDraftPhotoField(profile.id)} disabled={draft.photoUrls.length >= 8}>
                    Pridėti URL
                  </button>
                </fieldset>
                </details>
                <button type="submit" disabled={pendingActions[`${profile.id}:save`]}>Išsaugoti pakeitimus</button>
              </form>
              </details>
              </> : null}
            </article>
          );
        })}
      </section> : null}
    </main>
  );
}

function SelectedPhotoPreviews({ photos, onRemove }: { photos: SelectedPhoto[]; onRemove: (id: string) => void }) {
  if (!photos.length) return null;
  return <div className="admin-selected-photos" aria-label="Pasirinktos nuotraukos">
    {photos.map((photo) => <div key={photo.id}>
      <img src={photo.previewUrl} alt="" />
      <span>{photo.file.name}</span>
      <button type="button" className="admin-danger" onClick={() => onRemove(photo.id)}>Pašalinti pasirinktą</button>
    </div>)}
  </div>;
}

function profileToDraft(profile: Specialist): EditDraft {
  const categorySlugs = profile.categorySlugs?.length ? profile.categorySlugs : profile.categorySlug ? [profile.categorySlug] : [];
  const managedPreviewUrls = new Set((profile.photoRecords ?? []).map((photo) => photo.url));
  const manualPhotoUrls = (profile.photoUrls ?? []).filter((url) => !managedPreviewUrls.has(url) && !url.includes("/storage/v1/object/sign/") && !url.includes("token="));
  return {
    name: profile.name,
    companyName: profile.companyName ?? "",
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    email: profile.email,
    categorySlugs,
    subcategorySlugs: profile.subcategorySlugs ?? [],
    photoUrls: manualPhotoUrls.length ? manualPhotoUrls : [""],
    town: profile.town,
    operatingCities: profile.operatingCities.join(", "),
    radius: String(profile.radius),
    serviceArea: profile.serviceArea,
    description: profile.description
  };
}

function emptyConsentDraft(): ConsentDraft {
  return {
    channel: "whatsapp",
    consentText: "",
    capturedAt: toDateTimeLocalValue(new Date()),
    evidenceReference: ""
  };
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("lt-LT");
}

function selectedSubcategories(categories: Category[], categorySlugs: string[]) {
  return categories.filter((category) => categorySlugs.includes(category.slug)).flatMap((category) => category.subcategories);
}

function formatSubcategories(profile: Specialist, fallback = "Be subkategorijos") {
  return profile.subcategoryNames?.join(", ") || fallback;
}

function formatPublicStatus(profile: Specialist) {
  const status = profile.publicStatus ?? (profile.status === "approved" ? "public" : "private");
  return status === "private" ? "privatus" : "viešas";
}

function formatApprovalStatus(status: Specialist["status"]) {
  return status === "approved"
    ? "patvirtintas"
    : status === "suspended"
      ? "sustabdytas"
      : status === "rejected"
        ? "atmestas"
        : "laukiantis";
}

function formatPhotoStatus(photo: NonNullable<Specialist["photoRecords"]>[number]) {
  if (photo.removedAt) {
    return "pašalinta";
  }

  return photo.moderationStatus === "approved"
    ? "patvirtinta"
    : photo.moderationStatus === "rejected"
      ? "atmesta"
      : "laukiama";
}

function formatActionType(action: string) {
  const labels: Record<string, string> = {
    approve: "Patvirtinta",
    reject: "Atmesta",
    suspend: "Sustabdyta",
    return_pending: "Grąžinta patikrai",
    update: "Atnaujinta",
    moderate_photo: "Nuotraukos moderavimas",
    record_public_contact_consent: "Viešų kontaktų sutikimas",
    admin_note: "Vidinė pastaba",
    profile_admin_created: "Sukurta administratoriaus",
    profile_submitted: "Registracija pateikta"
  };
  return labels[action] ?? action;
}

function publicationEligibility(profile: Specialist) {
  const photoRecords = profile.photoRecords ?? [];
  const hasPhotoRecords = photoRecords.length > 0;
  const approvedVisiblePhotos = photoRecords.filter((photo) => photo.moderationStatus === "approved" && !photo.removedAt).length;
  const hasUnmoderatedVisiblePhotos = photoRecords.some((photo) => !photo.removedAt && photo.moderationStatus !== "approved");
  const hasContactDetails = Boolean(profile.phone || profile.email || profile.whatsapp);
  const hasServices = (profile.subcategorySlugs?.length ?? 0) >= 3 || (profile.subcategoryNames?.length ?? 0) >= 3;

  return [
    { label: "Patvirtinimo būsena: patvirtintas", ok: profile.status === "approved", isState: true },
    { label: "Viešumo būsena: viešas", ok: formatPublicStatus(profile) === "viešas", isState: true },
    { label: "Yra viešų kontaktų sutikimas", ok: Boolean(profile.publicContactConsentAt) },
    { label: hasServices ? "Yra bent 3 konkrečios paslaugos" : "Trūksta bent 3 konkrečių paslaugų", ok: hasServices },
    { label: "Yra aptarnavimo miestas ir spindulys", ok: profile.operatingCities.length > 0 && profile.radius > 0 },
    { label: "Yra viešas telefono, el. pašto arba WhatsApp kontaktas", ok: hasContactDetails },
    { label: hasPhotoRecords ? "Visos rodomos nuotraukos moderuotos" : "Nuotraukų nėra, viešas profilis naudos tuščią būseną", ok: !hasUnmoderatedVisiblePhotos },
    { label: approvedVisiblePhotos ? "Yra patvirtinta pagrindinė nuotrauka" : "Patvirtintų nuotraukų nėra", ok: !hasPhotoRecords || approvedVisiblePhotos > 0 }
  ];
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function directUpload(signedUrl: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("content-type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Tiesioginis įkėlimas nepavyko."));
    request.onerror = () => reject(new Error("Tiesioginis įkėlimas nepavyko."));
    request.send(file);
  });
}

function eligibilitySectionHref(profileId: string, label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("sutik")) return `#admin-consents-${profileId}`;
  if (normalized.includes("nuotrauk")) return `#admin-photos-${profileId}`;
  return `#admin-main-${profileId}`;
}

function profilesLoadedMessage(count: number, mode: string) {
  return mode === "seed" ? "Vietinis demo režimas: Supabase neprijungtas." : `Įkelta profilių: ${count}.`;
}

type AdminResponseData = {
  error?: string;
  validationErrors?: string[];
  profiles?: Specialist[];
  [key: string]: unknown;
};

export async function adminJsonRequest(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: AdminResponseData;
    try {
      data = text ? JSON.parse(text) as AdminResponseData : {};
    } catch {
      data = { error: text.trim() || `Serveris grąžino HTTP ${response.status} be tinkamo JSON atsakymo.` };
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }

}

export function adminActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "AbortError") return `${fallback} Užklausa viršijo 12 sekundžių limitą.`;
  if (error instanceof Error && error.message) return `${fallback} ${error.message}`;
  return fallback;
}
