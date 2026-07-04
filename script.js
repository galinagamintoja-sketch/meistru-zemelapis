const specialists = [
  {
    id: "jonas",
    name: "Jonas Apdaila",
    trade: "Apdaila",
    town: "Vilnius",
    regions: ["Vilnius", "Kaunas"],
    radius: 35,
    lat: 54.6872,
    lng: 25.2797,
    verification: ["contact", "portfolio", "whatsapp"],
    verificationLabel: "Darbų pavyzdžiai",
    rating: 4.9,
    reviewCount: 38,
    color: "#37503f",
    phone: "+370 636 01230",
    email: "jonas@localpro.lt",
    whatsapp: "37063601230",
    serviceArea: "Vilnius + 35 km, dalis Kauno krypties",
    photos: ["Vidaus dažymas", "Fasado atnaujinimas", "Medžio alyvavimas"],
    reviews: [
      ["Rasa", 5, "Tvarkingas darbas, atvyko sutartu laiku, apsaugojo grindis."],
      ["Mindaugas", 5, "Aiški komunikacija ir sąžininga kaina už du kambarius."],
    ],
  },
  {
    id: "darius",
    name: "Darius Santechnika",
    trade: "Santechnika",
    town: "Kaunas",
    regions: ["Kaunas", "Marijampolė"],
    radius: 30,
    lat: 54.8985,
    lng: 23.9036,
    verification: ["contact", "portfolio", "whatsapp"],
    verificationLabel: "Darbų nuotraukos",
    rating: 4.7,
    reviewCount: 24,
    color: "#56717a",
    phone: "+370 612 22110",
    email: "darius@localpro.lt",
    whatsapp: "37061222110",
    serviceArea: "Kaunas, Kauno rajonas ir Marijampolės kryptis",
    photos: ["Vonios vamzdynas", "Boilerio montavimas", "Nuotėkio remontas"],
    reviews: [
      ["Tomas", 5, "Nuotėkį sutvarkė tą pačią dieną ir paaiškino pasirinkimus."],
      ["Aistė", 4, "Profesionalus darbas, tik šiek tiek vėlavo."],
    ],
  },
  {
    id: "marius",
    name: "Marius Elektra",
    trade: "Elektra",
    town: "Klaipėda",
    regions: ["Klaipėda", "Telšiai"],
    radius: 45,
    lat: 55.7033,
    lng: 21.1443,
    verification: ["contact", "whatsapp"],
    verificationLabel: "WhatsApp kontaktas",
    rating: 4.8,
    reviewCount: 31,
    color: "#b8763a",
    phone: "+370 699 48331",
    email: "marius@localpro.lt",
    whatsapp: "37069948331",
    serviceArea: "Klaipėda, Gargždai, Palanga, Telšių kryptis",
    photos: ["Skydinė", "LED apšvietimas", "Rozečių planas"],
    reviews: [
      ["Laura", 5, "Tvarkingi laidai ir aiški sąskaita."],
      ["Paulius", 5, "Padėjo suplanuoti rozečių vietas prieš remontą."],
    ],
  },
  {
    id: "ruta",
    name: "Rūta Staliaus Darbai",
    trade: "Staliaus darbai",
    town: "Šiauliai",
    regions: ["Šiauliai", "Panevėžys"],
    radius: 40,
    lat: 55.9349,
    lng: 23.3137,
    verification: ["contact", "portfolio", "whatsapp"],
    verificationLabel: "Darbų nuotraukos",
    rating: 4.6,
    reviewCount: 17,
    color: "#211d18",
    phone: "+370 600 45090",
    email: "ruta@localpro.lt",
    whatsapp: "37060045090",
    serviceArea: "Šiauliai, Panevėžys, nestandartiniai baldai pagal susitarimą",
    photos: ["Spintos", "Virtuvės fasadai", "Ąžuolo lentynos"],
    reviews: [
      ["Greta", 5, "Tiksliai išmatavo ir pataikė norimą apdailą."],
      ["Andrius", 4, "Stiprus rezultatas, gamyba užtruko tris savaites."],
    ],
  },
  {
    id: "klaidas",
    name: "Klaidas Stogai",
    trade: "Stogai",
    town: "Panevėžys",
    regions: ["Panevėžys", "Utena"],
    radius: 60,
    lat: 55.7348,
    lng: 24.3575,
    verification: ["contact"],
    verificationLabel: "Kontaktas patvirtintas",
    rating: 4.4,
    reviewCount: 15,
    color: "#37503f",
    phone: "+370 611 77420",
    email: "klaidas@localpro.lt",
    whatsapp: "37061177420",
    serviceArea: "Panevėžys, Utena ir aplinkiniai rajonai",
    photos: ["Čerpės", "Lietvamzdžiai", "Plokščias stogas"],
    reviews: [
      ["Saulius", 5, "Greitai sureagavo po audros ir siuntė nuotraukas darbo metu."],
      ["Ieva", 4, "Gera kaina ir tvarkinga pabaiga."],
    ],
  },
  {
    id: "asta",
    name: "Asta Trinkelės ir Aplinka",
    trade: "Trinkelės ir aplinka",
    town: "Alytus",
    regions: ["Alytus", "Marijampolė"],
    radius: 50,
    lat: 54.3964,
    lng: 24.0456,
    verification: ["contact", "portfolio", "whatsapp"],
    verificationLabel: "Darbų nuotraukos",
    rating: 4.8,
    reviewCount: 19,
    color: "#56717a",
    phone: "+370 655 83210",
    email: "asta@localpro.lt",
    whatsapp: "37065583210",
    serviceArea: "Alytus, Druskininkų ir Marijampolės kryptys",
    photos: ["Trinkelės", "Terasos pagrindas", "Aplinkos bortai"],
    reviews: [
      ["Dovilė", 5, "Aiškus terminas ir labai tvarkinga aikštelė po darbų."],
      ["Karolis", 5, "Pasiūlė geresnį nuolydį vandeniui nubėgti."],
    ],
  },
  {
    id: "vytautas",
    name: "Vytautas Pilna Renovacija",
    trade: "Pilna renovacija",
    town: "Utena",
    regions: ["Utena", "Vilnius"],
    radius: 70,
    lat: 55.4976,
    lng: 25.5992,
    verification: ["contact", "portfolio", "whatsapp"],
    verificationLabel: "Darbų pavyzdžiai",
    rating: 4.9,
    reviewCount: 27,
    color: "#b8763a",
    phone: "+370 677 19024",
    email: "vytautas@localpro.lt",
    whatsapp: "37067719024",
    serviceArea: "Utena, Molėtai, dalis Vilniaus rajono",
    photos: ["Butų renovacija", "Šiltinimas", "Mazgų tvarkymas"],
    reviews: [
      ["Eglė", 5, "Suderino meistrus ir laikėsi biudžeto."],
      ["Nerijus", 5, "Puikiai paaiškino energinio efektyvumo pasirinkimus."],
    ],
  },
];

const tradeFilter = document.querySelector("#tradeFilter");
const locationFilter = document.querySelector("#locationFilter");
const verificationFilter = document.querySelector("#verificationFilter");
const resultsList = document.querySelector("#resultsList");
const resultCount = document.querySelector("#resultCount");
const resultsHeading = document.querySelector("#resultsHeading");
const resultsIntro = document.querySelector("#resultsIntro");
const profilePanel = document.querySelector("#profilePanel");
const activeAreaLabel = document.querySelector("#activeAreaLabel");
const radiusRange = document.querySelector("#radiusRange");
const radiusValue = document.querySelector("#radiusValue");
const previewButton = document.querySelector("#previewRegistration");
const registrationPreview = document.querySelector("#registrationPreview");

let activeId = specialists[0].id;
const markerLayer = L.layerGroup();
const areaLayer = L.layerGroup();

const map = L.map("map", {
  center: [55.1, 23.9],
  zoom: 7,
  minZoom: 6,
  maxZoom: 15,
  scrollWheelZoom: true,
  zoomControl: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

areaLayer.addTo(map);
markerLayer.addTo(map);

function stars(rating) {
  return "★".repeat(Math.round(rating));
}

function filteredSpecialists() {
  const trade = tradeFilter.value;
  const location = locationFilter.value;
  const verification = verificationFilter.value;

  return specialists.filter((person) => {
    const tradeMatch = trade === "all" || person.trade === trade;
    const locationMatch = location === "all" || person.regions.includes(location) || person.town === location;
    const verificationMatch = verification === "all" || person.verification.includes(verification);
    return tradeMatch && locationMatch && verificationMatch;
  });
}

function markerIcon(person) {
  return L.divIcon({
    className: "trade-marker",
    html: `<span style="background:${person.color}"><b>${person.trade.charAt(0)}</b></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  });
}

function popupHtml(person) {
  return `
    <div class="map-popup">
      <strong>${person.name}</strong>
      <span>${person.trade} - ${person.town}</span>
      <span>${person.verificationLabel}</span>
      <button type="button" data-profile-id="${person.id}">Atidaryti profilį</button>
    </div>
  `;
}

function selectSpecialist(id, shouldMoveMap = true) {
  activeId = id;
  render();

  const person = specialists.find((item) => item.id === id);
  if (person && shouldMoveMap) {
    map.setView([person.lat, person.lng], Math.max(map.getZoom(), 10), { animate: true });
  }

  document.querySelector("#profile").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResults(list) {
  resultCount.textContent = list.length;
  resultsHeading.innerHTML = list.length
    ? `<span id="resultCount">${list.length}</span> specialistai`
    : "Būkite pirmasis specialistas šioje vietoje";
  resultsIntro.textContent = list.length
    ? "Pasirinkite specialistą sąraše arba žemėlapyje ir peržiūrėkite darbo zoną."
    : "Šio filtro rezultatai dar tušti. Registruokitės nemokamai ir jūsų profilis čia atsiras pirmas.";

  if (!list.length) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <strong>Nėra atitikmenų pagal pasirinktus filtrus.</strong>
        <span>Keiskite miestą arba darbo sritį, arba registruokite savo paslaugą LocalPro žemėlapyje.</span>
        <a class="primary-action" href="#register">Registruotis nemokamai</a>
      </div>
    `;
    return;
  }

  resultsList.innerHTML = list
    .map(
      (person) => `
        <button class="result-card ${person.id === activeId ? "active" : ""}" data-id="${person.id}" type="button">
          <span class="meta-row">
            <strong>${person.name}</strong>
            <span class="rating">${person.rating} ${stars(person.rating)}</span>
          </span>
          <span class="meta-row">
            <span class="tag">${person.trade}</span>
            <span class="tag">${person.town}</span>
            <span class="tag">${person.radius} km zona</span>
            <span class="tag">${person.verificationLabel}</span>
          </span>
          <span>${person.reviewCount} atsiliepimai - ${person.serviceArea}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".result-card").forEach((card) => {
    card.addEventListener("click", () => selectSpecialist(card.dataset.id));
  });
}

function renderMap(list) {
  markerLayer.clearLayers();
  areaLayer.clearLayers();

  list.forEach((person) => {
    const area = L.circle([person.lat, person.lng], {
      radius: person.radius * 1000,
      color: person.color,
      weight: person.id === activeId ? 3 : 2,
      fillColor: person.color,
      fillOpacity: person.id === activeId ? 0.16 : 0.08,
    });

    const marker = L.marker([person.lat, person.lng], {
      icon: markerIcon(person),
      title: `${person.name} - ${person.trade}`,
    }).bindPopup(popupHtml(person));

    marker.on("click", () => {
      activeId = person.id;
      renderProfile(person);
      renderResults(filteredSpecialists());
      marker.openPopup();
    });

    areaLayer.addLayer(area);
    markerLayer.addLayer(marker);
  });

  activeAreaLabel.textContent = list.length ? `${list.length} žymekliai su darbo zonomis` : "Nėra atitikmenų";

  if (list.length) {
    const bounds = L.latLngBounds(list.map((person) => [person.lat, person.lng]));
    map.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 10 });
  }

  setTimeout(() => map.invalidateSize(), 50);
}

function renderProfile(person) {
  profilePanel.innerHTML = `
    <div class="profile-card">
      <div class="profile-summary">
        <p class="eyebrow">Pasirinktas specialistas</p>
        <h2>${person.name}</h2>
        <div class="tag-row">
          <span class="tag">${person.trade}</span>
          <span class="tag">${person.town}</span>
          <span class="tag">${person.verificationLabel}</span>
          <span class="rating">${person.rating} ${stars(person.rating)}</span>
        </div>
        <p>${person.reviewCount} klientų atsiliepimai. Darbo zona: ${person.serviceArea}.</p>
        <div class="verification-list">
          <span>Kontaktas patvirtintas</span>
          ${person.verification.includes("portfolio") ? "<span>Darbų galerija</span>" : ""}
          ${person.verification.includes("whatsapp") ? "<span>WhatsApp kontaktas</span>" : ""}
        </div>
        <div class="contact-list">
          <a href="tel:${person.phone.replaceAll(" ", "")}"><span>Telefonas</span><strong>${person.phone}</strong></a>
          <a href="https://wa.me/${person.whatsapp}"><span>WhatsApp</span><strong>Rašyti dabar</strong></a>
          <a href="mailto:${person.email}"><span>El. paštas</span><strong>${person.email}</strong></a>
        </div>
      </div>
      <div>
        <p class="eyebrow">Darbų nuotraukos</p>
        <div class="photo-grid">
          ${person.photos
            .map(
              (photo, index) => `
                <div class="work-photo" style="--photo-color:${index === 0 ? person.color : index === 1 ? "#56717a" : "#b8763a"}">${photo}</div>
              `,
            )
            .join("")}
        </div>
        <p class="eyebrow">Atsiliepimai</p>
        <div class="reviews">
          ${person.reviews
            .map(
              ([author, score, text]) => `
                <div class="review">
                  <div class="review-head"><strong>${author}</strong><span class="rating">${score}.0 ${stars(score)}</span></div>
                  <p>${text}</p>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderRegistrationPreview() {
  const name = document.querySelector("#formName").value.trim() || "Naujas LocalPro specialistas";
  const phone = document.querySelector("#formPhone").value.trim() || "Telefono numeris nepateiktas";
  const email = document.querySelector("#formEmail").value.trim() || "El. paštas nepateiktas";
  const town = document.querySelector("#formTown").value.trim() || "Vieta nepateikta";
  const trade = document.querySelector("#formTrade").value;
  const bio = document.querySelector("#formBio").value.trim() || "Trumpas aprašymas padės klientui suprasti, kokius darbus atliekate.";
  const radius = radiusRange.value;

  registrationPreview.innerHTML = `
    <h3>${name}</h3>
    <div class="tag-row">
      <span class="tag">${trade}</span>
      <span class="tag">${town}</span>
      <span class="tag">${radius} km zona</span>
      <span class="tag">Laukia patikros</span>
    </div>
    <p>${bio}</p>
    <div class="contact-list">
      <a href="tel:${phone.replaceAll(" ", "")}"><span>Telefonas</span><strong>${phone}</strong></a>
      <a href="mailto:${email}"><span>El. paštas</span><strong>${email}</strong></a>
    </div>
  `;
}

function render() {
  const list = filteredSpecialists();
  if (!list.some((person) => person.id === activeId) && list.length) {
    activeId = list[0].id;
  }

  renderResults(list);
  renderMap(list);
  const activePerson = specialists.find((person) => person.id === activeId) || list[0] || specialists[0];
  renderProfile(activePerson);
}

[tradeFilter, locationFilter, verificationFilter].forEach((filter) => {
  filter.addEventListener("change", render);
});

radiusRange.addEventListener("input", () => {
  radiusValue.textContent = radiusRange.value;
  renderRegistrationPreview();
});

previewButton.addEventListener("click", renderRegistrationPreview);

document.querySelectorAll("#formName, #formPhone, #formEmail, #formTown, #formTrade, #formBio").forEach((field) => {
  field.addEventListener("input", renderRegistrationPreview);
});

document.addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-profile-id]");
  if (profileButton) {
    selectSpecialist(profileButton.dataset.profileId, false);
  }
});

render();
renderRegistrationPreview();
