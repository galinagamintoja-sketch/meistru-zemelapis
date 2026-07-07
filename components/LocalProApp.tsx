"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Specialist } from "../lib/types";

type Props = {
  initialSpecialists: Specialist[];
  categories: Category[];
};

const cities = ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys", "Alytus", "Marijampolė", "Utena", "Tauragė", "Telšiai"];
const verificationOptions = [
  { value: "contact", label: "Kontaktas patvirtintas" },
  { value: "portfolio", label: "Darbų nuotraukos" },
  { value: "whatsapp", label: "WhatsApp kontaktas" }
];

export default function LocalProApp({ initialSpecialists, categories }: Props) {
  const [trade, setTrade] = useState("all");
  const [city, setCity] = useState("all");
  const [verification, setVerification] = useState("all");
  const [specialists, setSpecialists] = useState(initialSpecialists);
  const [activeId, setActiveId] = useState(initialSpecialists[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState({
    name: "Tomas Apdaila",
    phone: "+370 636 01230",
    email: "tomas@localpro.lt",
    city: "Vilnius",
    trade: categories[0]?.name ?? "Apdaila",
    description: "Vidaus apdaila, glaistymas, dažymas, laminato klojimas. Dirbu Vilniuje ir aplinkiniuose rajonuose.",
    radiusKm: 35,
    operatingCities: ["Vilnius", "Vilniaus rajonas"],
    consentAccepted: true
  });
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitTone, setSubmitTone] = useState<"success" | "error" | "">("");
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const profileSectionRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const areaLayerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const activeSpecialist = useMemo(
    () => specialists.find((specialist) => specialist.id === activeId) ?? specialists[0] ?? null,
    [activeId, specialists]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpecialists() {
      setLoading(true);
      const params = new URLSearchParams();
      if (trade !== "all") params.set("service", trade);
      if (city !== "all") params.set("city", city);
      if (verification !== "all") params.set("verification", verification);

      const response = await fetch(`/api/specialists?${params.toString()}`, { signal: controller.signal });
      const data = await response.json();
      const list = data.specialists ?? [];
      setSpecialists(list);
      setActiveId((current) => (list.some((specialist: Specialist) => specialist.id === current) ? current : list[0]?.id ?? ""));
      setLoading(false);
    }

    loadSpecialists().catch((error) => {
      if (error.name !== "AbortError") {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [trade, city, verification]);

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

      specialists.forEach((specialist) => {
        const isActive = specialist.id === activeId;
        leaflet
          .circle([specialist.lat, specialist.lng], {
            radius: specialist.radius * 1000,
            color: specialist.color,
            weight: isActive ? 3 : 2,
            fillColor: specialist.color,
            fillOpacity: isActive ? 0.16 : 0.08
          })
          .addTo(areaLayer);

        const icon = leaflet.divIcon({
          className: "trade-marker",
          html: `<span style="background:${specialist.color}"><b>${specialist.trade.charAt(0)}</b></span>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          popupAnchor: [0, -20]
        });

        const marker = leaflet
          .marker([specialist.lat, specialist.lng], { icon, title: `${specialist.name} - ${specialist.trade}` })
          .bindPopup(`<div class="map-popup"><strong>${specialist.name}</strong><span>${specialist.trade} - ${specialist.town}</span><span>${specialist.verificationLabel}</span></div>`);

        marker.on("click", () => openSpecialistProfile(specialist.id));
        marker.addTo(markerLayer);
      });

      if (specialists.length) {
        const bounds = leaflet.latLngBounds(specialists.map((specialist) => [specialist.lat, specialist.lng]));
        map.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 10 });
      }

      setTimeout(() => map.invalidateSize(), 50);
    }

    renderMap();
  }, [activeId, specialists]);

  function stars(rating: number) {
    return "★".repeat(Math.max(0, Math.round(rating)));
  }

  function openSpecialistProfile(specialistId: string) {
    setActiveId(specialistId);
    window.setTimeout(() => {
      profileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", "#profile");
    }, 0);
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage("Siunčiama registracija...");
    setSubmitTone("");

    const response = await fetch("/api/tradesperson/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formState)
    });
    const data = await response.json();

    if (!response.ok) {
      setSubmitTone("error");
      setSubmitMessage(data.error ?? "Registracijos išsaugoti nepavyko.");
      return;
    }

    setSubmitTone("success");
    setSubmitMessage("Registracija priimta. Profilis pažymėtas kaip laukiantis administratoriaus patvirtinimo.");
  }

  function updateOperatingCity(value: string, checked: boolean) {
    setFormState((current) => ({
      ...current,
      operatingCities: checked
        ? Array.from(new Set([...current.operatingCities, value]))
        : current.operatingCities.filter((item) => item !== value)
    }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#search" aria-label="LocalPro.lt">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>
            <strong>LocalPro.lt</strong>
            <small>Patikrinti specialistai Lietuvos miestuose</small>
          </span>
        </a>
        <nav className="stage-nav" aria-label="Puslapio skyriai">
          <a href="#search">Rasti specialistą</a>
          <a href="#services">Paslaugos</a>
          <a href="#register">Tapti specialistu</a>
          <a href="#how">Kaip veikia</a>
          <a href="/admin">Admin</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="search">
          <div className="hero-copy">
            <p className="eyebrow">Žemėlapis pirmiausia</p>
            <h1>Patikimi meistrai jūsų mieste.</h1>
            <p>
              LocalPro.lt jungia klientus su patikrintais statybos, remonto ir namų priežiūros specialistais pagal miestą,
              darbo zoną ir paslaugą.
            </p>
          </div>

          <form className="search-panel" aria-label="Rasti specialistą">
            <div className="panel-title">
              <strong>Greita paieška</strong>
              <span>{loading ? "Kraunama" : "Pagal zoną ir patikrą"}</span>
            </div>
            <label>
              Darbo sritis
              <select value={trade} onChange={(event) => setTrade(event.target.value)}>
                <option value="all">Visos sritys</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Miestas / rajonas
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="all">Visa Lietuva</option>
                {cities.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Profilio signalai
              <select value={verification} onChange={(event) => setVerification(event.target.value)}>
                <option value="all">Visi specialistai</option>
                {verificationOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <div className="hero-actions" aria-label="Pagrindiniai veiksmai">
              <a className="primary-action" href="#mapSection">Ieškoti žemėlapyje</a>
              <a className="secondary-action" href="#register">Registruotis nemokamai</a>
            </div>
          </form>
        </section>

        <section className="solutions-section" id="services">
          <div className="section-heading compact">
            <p className="eyebrow">Sprendimai</p>
            <h2>Viena vieta klientams, specialistams ir statybos verslui.</h2>
          </div>
          <div className="solutions-grid">
            <article>
              <strong>Ieškotojams</strong>
              <p>Raskite specialistą pagal miestą, paslaugą ir realią darbo zoną žemėlapyje.</p>
            </article>
            <article>
              <strong>Specialistams</strong>
              <p>Nemokamai sukurkite profilį, parodykite darbus ir gaukite tiesioginius kontaktus.</p>
            </article>
            <article>
              <strong>Verslui</strong>
              <p>Backend dabar ruošiamas registracijai, patvirtinimui, importui ir WhatsApp onboardingui.</p>
            </article>
          </div>
          <div className="service-pills" aria-label="Paslaugų kategorijos">
            {categories.map((category) => <span key={category.id}>{category.name}</span>)}
          </div>
        </section>

        <section className="map-layout" id="mapSection" aria-label="LocalPro specialistų žemėlapis ir rezultatai">
          <aside className="results-column">
            <div className="section-heading compact">
              <p className="eyebrow">Specialistai žemėlapyje</p>
              <h2>{specialists.length ? <><span>{specialists.length}</span> specialistai</> : "Būkite pirmasis specialistas šioje vietoje"}</h2>
              <p>{specialists.length ? "Pasirinkite specialistą sąraše arba žemėlapyje ir peržiūrėkite darbo zoną." : "Šio filtro rezultatai dar tušti. Registruokitės nemokamai ir jūsų profilis čia atsiras pirmas."}</p>
            </div>
            <div className="results-list" aria-live="polite">
              {specialists.length ? specialists.map((specialist) => (
                <button
                  aria-controls="profile"
                  className={`result-card ${specialist.id === activeId ? "active" : ""}`}
                  key={specialist.id}
                  onClick={() => openSpecialistProfile(specialist.id)}
                  type="button"
                >
                  <span className="meta-row">
                    <strong>{specialist.name}</strong>
                    <span className="rating">{specialist.rating ? specialist.rating.toFixed(1) : "Naujas"} {stars(specialist.rating)}</span>
                  </span>
                  <span className="meta-row">
                    <span className="tag">{specialist.trade}</span>
                    <span className="tag">{specialist.town}</span>
                    <span className="tag">{specialist.radius} km zona</span>
                    <span className="tag">{specialist.verificationLabel}</span>
                  </span>
                  <span>{specialist.reviewCount} atsiliepimai - dirba: {specialist.operatingCities.join(", ")}. {specialist.serviceArea}</span>
                  <span className="open-profile-label">Atidaryti profilį</span>
                </button>
              )) : (
                <div className="empty-state">
                  <strong>Nėra atitikmenų pagal pasirinktus filtrus.</strong>
                  <span>Keiskite miestą arba darbo sritį, arba registruokite savo paslaugą LocalPro žemėlapyje.</span>
                  <a className="primary-action" href="#register">Registruotis nemokamai</a>
                </div>
              )}
            </div>
          </aside>

          <section className="map-board" aria-label="OpenStreetMap LocalPro specialistų žemėlapis">
            <div className="map-toolbar">
              <span>LocalPro žemėlapis</span>
              <span>{specialists.length ? `${specialists.length} žymekliai su darbo zonomis` : "Nėra atitikmenų"}</span>
            </div>
            <div className="real-map" ref={mapElementRef} aria-label="Interaktyvus OpenStreetMap su LocalPro specialistų žymekliais">
              <div className="map-hint">Traukite žemėlapį, artinkite arba naudokite +/-</div>
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
                  <span className="tag">{activeSpecialist.town}</span>
                  <span className="tag">{activeSpecialist.verificationLabel}</span>
                  <span className="rating">{activeSpecialist.rating ? activeSpecialist.rating.toFixed(1) : "Naujas"} {stars(activeSpecialist.rating)}</span>
                </div>
                <p>{activeSpecialist.reviewCount} klientų atsiliepimai. Darbo zona: {activeSpecialist.serviceArea}.</p>
                <p>{activeSpecialist.description}</p>
                <div className="verification-list">
                  {activeSpecialist.verification.map((label) => <span key={label}>{label}</span>)}
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
                  {activeSpecialist.photos.map((photo, index) => (
                    <div className="work-photo" key={photo} style={{ "--photo-color": index === 0 ? activeSpecialist.color : index === 1 ? "#56717a" : "#b8763a" } as React.CSSProperties}>{photo}</div>
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
                <p className="eyebrow">Nėra profilio</p>
                <h2>Šiam filtrui dar nėra patvirtinto specialisto.</h2>
                <p>Pakeiskite miestą arba darbo sritį, arba registruokite pirmą specialistą šioje zonoje.</p>
              </div>
            </article>
          )}
        </section>

        <section className="register-section" id="register">
          <div className="section-heading">
            <p className="eyebrow">Specialistams</p>
            <h2>Registruokitės nemokamai ir atsiraskite LocalPro žemėlapyje.</h2>
            <p>Sukurkite aiškų profilį su miestu, darbo zona, paslaugomis, nuotraukomis ir vieno paspaudimo kontaktu.</p>
          </div>

          <div className="register-grid">
            <form className="registration-form" aria-label="LocalPro specialisto registracijos forma" onSubmit={submitRegistration}>
              <div className="form-row">
                <label>
                  Vardas arba įmonės pavadinimas
                  <input value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} type="text" autoComplete="name" />
                </label>
                <label>
                  Telefono numeris
                  <input value={formState.phone} onChange={(event) => setFormState({ ...formState, phone: event.target.value })} type="tel" autoComplete="tel" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  El. paštas
                  <input value={formState.email} onChange={(event) => setFormState({ ...formState, email: event.target.value })} type="email" autoComplete="email" />
                </label>
                <label>
                  Pagrindinis miestas
                  <input value={formState.city} onChange={(event) => setFormState({ ...formState, city: event.target.value })} type="text" autoComplete="address-level2" />
                </label>
              </div>
              <label>
                Darbo sritis
                <select value={formState.trade} onChange={(event) => setFormState({ ...formState, trade: event.target.value })}>
                  {categories.map((category) => <option key={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>
                Trumpas aprašymas
                <textarea value={formState.description} onChange={(event) => setFormState({ ...formState, description: event.target.value })} rows={4} />
              </label>
              <label>
                Darbo spindulys
                <input type="range" min="5" max="100" value={formState.radiusKm} onChange={(event) => setFormState({ ...formState, radiusKm: Number(event.target.value) })} />
                <span><strong>{formState.radiusKm}</strong> km aplink miestą</span>
              </label>
              <fieldset>
                <legend>Aptarnaujamos vietos</legend>
                {cities.slice(0, 6).map((item) => (
                  <label key={item}>
                    <input type="checkbox" checked={formState.operatingCities.includes(item)} onChange={(event) => updateOperatingCity(item, event.target.checked)} />
                    {item}
                  </label>
                ))}
              </fieldset>
              <label>
                <span>
                  <input type="checkbox" checked={formState.consentAccepted} onChange={(event) => setFormState({ ...formState, consentAccepted: event.target.checked })} />
                  Sutinku, kad LocalPro peržiūrėtų informaciją ir publikuotų profilį tik po patvirtinimo.
                </span>
              </label>
              <button type="submit">Siųsti registraciją</button>
              {submitMessage ? <p className={`status-message ${submitTone}`}>{submitMessage}</p> : null}
            </form>

            <aside className="registration-preview" aria-label="Registracijos peržiūra">
              <p className="eyebrow">Profilio peržiūra</p>
              <div className="preview-card">
                <h3>{formState.name || "Naujas LocalPro specialistas"}</h3>
                <div className="tag-row">
                  <span className="tag">{formState.trade}</span>
                  <span className="tag">{formState.city}</span>
                  <span className="tag">{formState.radiusKm} km zona</span>
                  <span className="tag">Laukia patikros</span>
                </div>
                <p>{formState.description}</p>
                <div className="contact-list">
                  <a href={`tel:${formState.phone.replaceAll(" ", "")}`}><span>Telefonas</span><strong>{formState.phone}</strong></a>
                  <a href={`mailto:${formState.email}`}><span>El. paštas</span><strong>{formState.email}</strong></a>
                </div>
              </div>
              <div className="approval-flow" aria-label="Publikavimo eiga">
                <span>1. Užpildote formą</span>
                <span>2. Saugome kaip pending</span>
                <span>3. Admin patikrina</span>
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
            <div><strong>Registracija</strong><p>Specialistas užpildo trumpą formą arba vėliau ateina per WhatsApp onboardingą.</p></div>
            <div><strong>Duomenų bazė</strong><p>Profilis saugomas kaip pending su sutikimu ir aptarnaujamomis vietomis.</p></div>
            <div><strong>Admin patikra</strong><p>Publikuojame tik po patvirtinimo. Kontaktų ir WhatsApp patikra pažymima atskirai.</p></div>
            <div><strong>Kontaktas</strong><p>Klientas mato darbo zoną ir pats susisiekia telefonu arba per WhatsApp.</p></div>
          </div>
        </section>
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
