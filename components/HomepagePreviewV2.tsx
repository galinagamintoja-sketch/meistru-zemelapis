"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import SafeProfileImage from "./SafeProfileImage";
import type { Category, Specialist } from "../lib/types";
import type { HomepageAccountState } from "../lib/homepage-account-state";
import { profileSeoSlug } from "../lib/seo";
import { distanceKm } from "../lib/geo";
import styles from "./HomepagePreviewV2.module.css";
import LocalProPreviewBrand from "./LocalProPreviewBrand";

type Props = {
  initialSpecialists: Specialist[];
  categories: Category[];
  accountState?: HomepageAccountState;
};

type ViewMode = "list" | "map";
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;
type SearchPoint = { lat: number; lng: number };

const nearbyInitialRadiusKm = 25;
const nearbyExpandedRadiusKm = 50;

const fallbackAccountState: HomepageAccountState = {
  authenticated: false,
  hasProfile: false,
  isAdmin: false
};

const normalized = (value: string | null | undefined) => (value ?? "")
  .toLocaleLowerCase("lt")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

function specialistPhoto(specialist: Specialist) {
 const candidates = [
 specialist.photoRecords?.find((photo) => photo.moderationStatus === "approved" && !photo.removedAt)?.url,
 specialist.photoUrls?.[0],
 specialist.photos?.[0]
 ];

 return candidates.find((value) => value && /^(https?:\/\/|\/(?!\/))/.test(value.trim())) ?? null;
}

function specialistCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return `${count} specialistų`;
  if (last === 1) return `${count} specialistas`;
  if (last >= 2 && last <= 9) return `${count} specialistai`;
  return `${count} specialistų`;
}

function specialistMatchesService(specialist: Specialist, query: string) {
  const needle = normalized(query);
  if (!needle) return true;

  const values = [
    specialist.trade,
    specialist.companyName,
    ...(specialist.categoryNames ?? []),
    ...(specialist.subcategoryNames ?? [])
  ].map(normalized);

  return values.some((value) => value.includes(needle));
}

function specialistMatchesLocation(specialist: Specialist, query: string) {
  const needle = normalized(query);
  if (!needle) return true;

  const values = [
    specialist.town,
    specialist.district,
    specialist.approximateLocation,
    ...specialist.operatingCities
  ].map(normalized);

  return values.some((value) => value.includes(needle));
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

function WrenchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.2a5 5 0 0 0-6.7 6.7L3 17.7V21h3.3l4.8-4.8a5 5 0 0 0 6.7-6.7l-3.1 3.1-3.3-3.3 3.1-3.1Z" /></svg>;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
}

function ListIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>;
}

function MapIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" /><path d="M9 3v16M15 5v16" /></svg>;
}

function AccountLink({ accountState }: { accountState: HomepageAccountState }) {
  if (!accountState.authenticated) {
    return (
      <div className={styles.authActions}>
        <a className={styles.loginLink} href="/login">Prisijungti</a>
        <a className={styles.registerButton} href="/meistro-registracija">Sukurti profilį</a>
      </div>
    );
  }

  const accountLabel = accountState.displayName || accountState.email || "Mano paskyra";
  return (
    <div className={styles.authActions}>
      <a className={styles.accountName} href={accountState.hasProfile ? "/meistras/uzklausos" : "/meistro-registracija"}>
        {accountLabel}
      </a>
      {!accountState.hasProfile ? <a className={styles.registerButton} href="/meistro-registracija">Sukurti profilį</a> : null}
    </div>
  );
}

export default function HomepagePreviewV2({
  initialSpecialists,
  categories,
  accountState = fallbackAccountState
}: Props) {
  const [serviceQuery, setServiceQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showAll, setShowAll] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [searchPoint, setSearchPoint] = useState<SearchPoint | null>(null);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(nearbyInitialRadiusKm);
  const [nearbyMessage, setNearbyMessage] = useState("");
  const [locationPending, setLocationPending] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletLayerGroup | null>(null);

  const serviceSuggestions = useMemo(() => {
    const names = categories.flatMap((category) => [category.name, ...category.subcategories.map((subcategory) => subcategory.name)]);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "lt"));
  }, [categories]);

  const locationSuggestions = useMemo(() => {
    const names = initialSpecialists.flatMap((specialist) => [specialist.town, ...specialist.operatingCities]).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "lt"));
  }, [initialSpecialists]);

  const filteredSpecialists = useMemo(() => initialSpecialists
    .filter((specialist) => specialistMatchesService(specialist, serviceQuery))
    .filter((specialist) => specialistMatchesLocation(specialist, locationQuery))
    .map((specialist) => searchPoint ? {
      ...specialist,
      distanceKm: distanceKm(searchPoint, {
        lat: specialist.registeredLat ?? specialist.lat,
        lng: specialist.registeredLng ?? specialist.lng
      })
    } : specialist)
    .filter((specialist) => !searchPoint || (
      (specialist.distanceKm ?? Number.POSITIVE_INFINITY) <= nearbyRadiusKm &&
      (specialist.radius >= (specialist.distanceKm ?? Number.POSITIVE_INFINITY) || specialist.radius >= 150)
    ))
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount ||
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)),
  [initialSpecialists, locationQuery, nearbyRadiusKm, searchPoint, serviceQuery]);

  const nearbyInitialMatches = useMemo(() => {
    if (!searchPoint) return [];
    return initialSpecialists
      .filter((specialist) => specialistMatchesService(specialist, serviceQuery))
      .map((specialist) => ({
        specialist,
        distance: distanceKm(searchPoint, {
          lat: specialist.registeredLat ?? specialist.lat,
          lng: specialist.registeredLng ?? specialist.lng
        })
      }))
      .filter(({ specialist, distance }) => distance <= nearbyInitialRadiusKm && (specialist.radius >= distance || specialist.radius >= 150));
  }, [initialSpecialists, searchPoint, serviceQuery]);

  useEffect(() => {
    if (!searchPoint || nearbyRadiusKm !== nearbyInitialRadiusKm || nearbyInitialMatches.length) return;
    setNearbyRadiusKm(nearbyExpandedRadiusKm);
    setNearbyMessage("25 km atstumu specialistų neradome, todėl paiešką automatiškai išplėtėme iki 50 km.");
  }, [nearbyInitialMatches.length, nearbyRadiusKm, searchPoint]);

  const visibleSpecialists = useMemo(
    () => showAll ? filteredSpecialists : filteredSpecialists.slice(0, 8),
    [filteredSpecialists, showAll]
  );
  const mapSpecialists = useMemo(() => filteredSpecialists.slice(0, 80), [filteredSpecialists]);

  useEffect(() => {
    if (viewMode !== "map" || !mapElementRef.current || mapRef.current) return;

    let cancelled = false;

    async function setupMap() {
      const leaflet = await import("leaflet");
      if (cancelled || !mapElementRef.current) return;

      const map = leaflet.map(mapElementRef.current, {
        center: [55.18, 23.88],
        zoom: 7,
        zoomControl: true,
        scrollWheelZoom: true
      });

      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      mapRef.current = map;
      markerLayerRef.current = leaflet.layerGroup().addTo(map);
      setMapReady(true);
    }

    setupMap();

    return () => {
      cancelled = true;
      setMapReady(false);
      markerLayerRef.current?.clearLayers();
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [viewMode]);

  useEffect(() => {
    async function renderMarkers() {
      const map = mapRef.current;
      const markerLayer = markerLayerRef.current;
      if (!map || !markerLayer) return;

      const leaflet = await import("leaflet");
      markerLayer.clearLayers();

      const points: [number, number][] = [];
      mapSpecialists.forEach((specialist) => {
        if (!Number.isFinite(specialist.lat) || !Number.isFinite(specialist.lng)) return;
        points.push([specialist.lat, specialist.lng]);

        const marker = leaflet.circleMarker([specialist.lat, specialist.lng], {
          radius: 9,
          weight: 3,
          color: "#fffaf0",
          fillColor: "#c8611b",
          fillOpacity: 1
        });

        const popup = document.createElement("div");
        popup.className = styles.mapPopup;
        const name = document.createElement("strong");
        name.textContent = specialist.companyName || specialist.name;
        const photoWrap = document.createElement("div");
        photoWrap.className = styles.mapPopupPhoto;
        const photoUrl = specialistPhoto(specialist);
        if (photoUrl) {
          const photo = document.createElement("img");
          photo.src = photoUrl;
          photo.alt = `${specialist.name} darbų nuotrauka`;
          photo.addEventListener("error", () => {
            photo.remove();
            const fallback = document.createElement("span");
            fallback.textContent = specialist.name.slice(0, 1).toUpperCase();
            photoWrap.append(fallback);
          }, { once: true });
          photoWrap.append(photo);
        } else {
          const fallback = document.createElement("span");
          fallback.textContent = (specialist.name.trim().charAt(0) || specialist.trade.trim().charAt(0) || "?").toLocaleUpperCase("lt");
          fallback.setAttribute("aria-label", "Darbų nuotraukos nėra");
          photoWrap.append(fallback);
        }
        const trade = document.createElement("span");
        trade.textContent = specialist.trade;
        const place = document.createElement("span");
        place.textContent = specialist.approximateLocation || specialist.town;
        const rating = document.createElement("span");
        rating.textContent = specialist.rating ? `★ ${specialist.rating.toFixed(1)} (${specialist.reviewCount})` : "Naujas specialistas";
        const link = document.createElement("a");
        link.href = `/meistrai/${profileSeoSlug(specialist)}`;
        link.textContent = "Peržiūrėti profilį";
        popup.append(name, photoWrap, trade, place, rating, link);
        marker.bindPopup(popup);
        marker.addTo(markerLayer);
      });

      if (points.length) {
        const bounds = leaflet.latLngBounds(points);
        map.fitBounds(bounds.pad(0.2), { maxZoom: 10, animate: false });
      } else {
        map.setView([55.18, 23.88], 7, { animate: false });
      }

      window.setTimeout(() => map.invalidateSize({ pan: false }), 80);
    }

    renderMarkers();
  }, [mapReady, mapSpecialists]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowAll(false);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function findSpecialistsNearMe() {
    if (!navigator.geolocation) {
      setNearbyMessage("Ši naršyklė negali nustatyti jūsų vietos. Įrašykite miestą ranka.");
      return;
    }

    setLocationPending(true);
    setNearbyMessage("Nustatome jūsų vietą…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocationQuery("");
      setSearchPoint({ lat: coords.latitude, lng: coords.longitude });
      setNearbyRadiusKm(nearbyInitialRadiusKm);
      setNearbyMessage("Rodomi specialistai iki 25 km nuo jūsų.");
      setLocationPending(false);
      setShowAll(false);
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, () => {
      setNearbyMessage("Vietos nustatyti nepavyko. Leiskite vietos prieigą arba įrašykite miestą ranka.");
      setLocationPending(false);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  return (
    <div className={styles.pageShell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="LocalPro.lt pagrindinis puslapis"><LocalProPreviewBrand /></a>
        <nav className={styles.nav} aria-label="Pagrindinė navigacija">
          <a href="#how-it-works">Kaip tai veikia?</a>
          <a href="/meistro-registracija">Specialistams</a>
        </nav>
        <AccountLink accountState={accountState} />
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>LocalPro specialistams</p>
          <h1>Patikimi meistrai<br /><span>jūsų mieste</span></h1>
          <p className={styles.heroSubhead}>Susikurkite aiškų profilį, nurodykite darbo zoną ir leiskite klientams lengviau jus rasti bei susisiekti.</p>

          <form className={styles.searchBar} onSubmit={submitSearch} aria-label="Rasti vietos specialistą">
            <label className={styles.searchField}>
              <span className={styles.fieldIcon}><WrenchIcon /></span>
              <span className={styles.visuallyHidden}>Paslauga</span>
              <input
                list="homepage-v2-services"
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Kokia paslauga jums reikalinga?"
                type="search"
              />
              <datalist id="homepage-v2-services">
                {serviceSuggestions.map((service) => <option key={service} value={service} />)}
              </datalist>
            </label>
            <label className={styles.searchField}>
              <span className={styles.fieldIcon}><PinIcon /></span>
              <span className={styles.visuallyHidden}>Miestas arba vietovė</span>
              <input
                list="homepage-v2-locations"
                value={locationQuery}
                onChange={(event) => { setLocationQuery(event.target.value); setSearchPoint(null); setNearbyMessage(""); }}
                placeholder="Miestas arba vietovė"
                type="search"
              />
              <datalist id="homepage-v2-locations">
                {locationSuggestions.map((location) => <option key={location} value={location} />)}
              </datalist>
            </label>
            <button className={styles.searchButton} type="submit"><SearchIcon />Ieškoti</button>
          </form>
          <button className={styles.nearMeButton} type="button" onClick={findSpecialistsNearMe} disabled={locationPending}>
            <PinIcon />{locationPending ? "Nustatoma vieta…" : "Rodyti specialistus netoli manęs"}
          </button>
          {nearbyMessage ? <p className={styles.nearbyMessage} role="status">{nearbyMessage}</p> : null}
        </section>

        <section className={styles.resultsSection} ref={resultsRef} id="results">
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.eyebrow}>Netoliese</p>
              <h2>Rekomenduojami specialistai</h2>
              <p>{filteredSpecialists.length ? `${specialistCountLabel(filteredSpecialists.length)} pagal jūsų paiešką` : "Pagal šią paiešką specialistų kol kas nėra"}</p>
            </div>
            <div className={styles.viewToggle} role="group" aria-label="Pasirinkti rezultatų vaizdą">
              <button type="button" className={viewMode === "list" ? styles.activeView : ""} onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}><ListIcon />Sąrašas</button>
              <button type="button" className={viewMode === "map" ? styles.activeView : ""} onClick={() => setViewMode("map")} aria-pressed={viewMode === "map"}><MapIcon />Žemėlapis</button>
            </div>
          </div>

          <div className={`${styles.listView} ${viewMode !== "list" ? styles.hiddenView : ""}`} aria-hidden={viewMode !== "list"}>
            {visibleSpecialists.length ? visibleSpecialists.map((specialist) => {
              const photo = specialistPhoto(specialist);
              const location = specialist.approximateLocation || specialist.town;
              const services = specialist.subcategoryNames?.slice(0, 2) ?? specialist.categoryNames?.slice(0, 2) ?? [];
              return (
                <a className={styles.specialistCard} href={`/meistrai/${profileSeoSlug(specialist)}`} key={specialist.id}>
                  <div className={styles.photoWrap}>
                    <SafeProfileImage
                      src={photo}
                      alt={`${specialist.name} darbų nuotrauka`}
                      specialistName={specialist.name}
                      trade={specialist.trade}
                      className={styles.specialistPhoto}
                    />
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <div>
                        <h3>{specialist.companyName || specialist.name}</h3>
                        <p>{specialist.trade}</p>
                      </div>
                      {specialist.verification.length ? <span className={styles.verified}>Patikrintas</span> : null}
                    </div>
                    <div className={styles.cardMeta}>
                      <span>{location}</span>
                      {typeof specialist.distanceKm === "number" ? <span>~ {specialist.distanceKm.toFixed(1)} km</span> : null}
                      <span className={styles.rating}>★ {specialist.rating ? specialist.rating.toFixed(1) : "Naujas"}</span>
                      {specialist.reviewCount ? <span className={styles.reviewCount}>{specialist.reviewCount} atsiliep.</span> : null}
                    </div>
                    {services.length ? <div className={styles.tags}>{services.map((service) => <span key={service}>{service}</span>)}</div> : null}
                  </div>
                  <span className={styles.cardArrow} aria-hidden="true">→</span>
                </a>
              );
            }) : (
              <div className={styles.emptyState}>
                <h3>Nerasta pagal šią paiešką</h3>
                <p>Pabandykite kitą paslaugą, miestą arba išvalykite paiešką.</p>
                <button type="button" onClick={() => { setServiceQuery(""); setLocationQuery(""); }}>Rodyti visus specialistus</button>
              </div>
            )}
          </div>

          <div className={`${styles.mapView} ${viewMode !== "map" ? styles.hiddenView : ""}`} aria-hidden={viewMode !== "map"}>
            <div className={styles.mapElement} ref={mapElementRef} aria-label="LocalPro specialistų žemėlapis" />
          </div>

          {filteredSpecialists.length > 8 && viewMode === "list" ? (
            <button className={styles.moreButton} type="button" onClick={() => setShowAll((current) => !current)}>
              {showAll ? "Rodyti mažiau" : `Rodyti daugiau (${filteredSpecialists.length - 8})`}
            </button>
          ) : null}
        </section>

        <section className={styles.registrationCta} id="how-it-works">
          <div className={styles.ctaIcon} aria-hidden="true">1</div>
          <div>
            <p className={styles.eyebrow}>Specialistams</p>
            <h2>Leiskite klientams jus atrasti.</h2>
            <p>Susikurkite profilį su paslaugomis, darbo zona ir atliktų darbų nuotraukomis.</p>
          </div>
          <a href="/meistro-registracija">Sukurti profilį <span>→</span></a>
        </section>
        <footer className={styles.footer}>
          <a href="/privacy">Privatumo politika</a>
          <a href="/terms">Naudojimosi sąlygos</a>
          <a href="mailto:pagalba@localpro.lt">Pagalba</a>
        </footer>
      </main>
    </div>
  );
}
