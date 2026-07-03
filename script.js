const tradesmen = [
  {
    id: "jonas",
    name: "Jonas Apdaila",
    trade: "Apdaila",
    town: "Lentvaris",
    regions: ["Vilnius", "Trakai"],
    radius: 35,
    lat: 54.6476,
    lng: 25.0513,
    rating: 4.9,
    reviewCount: 38,
    trustLevel: "Verified",
    color: "#1f5e46",
    phone: "+370 636 01230",
    email: "jonas@localpro.lt",
    serviceArea: "Lentvaris + 35 km, Vilnius ir Traku rajonai",
    photos: ["Vidaus dazymas", "Fasado atnaujinimas", "Medzio alyvavimas"],
    reviews: [
      ["Rasa", 5, "Tvarkingas darbas, atvyko sutartu laiku, apsaugojo grindis."],
      ["Mindaugas", 5, "Aiski komunikacija ir sazininga kaina uz du kambarius."],
    ],
  },
  {
    id: "darius",
    name: "Darius Santechnika",
    trade: "Santechnika",
    town: "Vilnius",
    regions: ["Vilnius"],
    radius: 25,
    lat: 54.6872,
    lng: 25.2797,
    rating: 4.7,
    reviewCount: 24,
    trustLevel: "Phone verified",
    color: "#2f7281",
    phone: "+370 612 22110",
    email: "darius@localpro.lt",
    serviceArea: "Vilniaus miestas ir 25 km aplink",
    photos: ["Vonios vamzdynas", "Boilerio montavimas", "Nuotekio remontas"],
    reviews: [
      ["Tomas", 5, "Nuoteki sutvarke ta pacia diena ir paaiskino pasirinkimus."],
      ["Aiste", 4, "Profesionalus darbas, tik siek tiek velavo."],
    ],
  },
  {
    id: "marius",
    name: "Marius Elektra",
    trade: "Elektra",
    town: "Kaunas",
    regions: ["Kaunas"],
    radius: 45,
    lat: 54.8985,
    lng: 23.9036,
    rating: 4.8,
    reviewCount: 31,
    trustLevel: "Verified",
    color: "#d59d3f",
    phone: "+370 699 48331",
    email: "marius@localpro.lt",
    serviceArea: "Kaunas, Kauno rajonas, Jonavos kryptis",
    photos: ["Skydine", "LED apsvietimas", "Rozeciu planas"],
    reviews: [
      ["Laura", 5, "Tvarkingi laidai ir aiski saskaita."],
      ["Paulius", 5, "Padejo suplanuoti rozeciu vietas pries remonta."],
    ],
  },
  {
    id: "ruta",
    name: "Ruta Staliaus Darbai",
    trade: "Staliaus darbai",
    town: "Trakai",
    regions: ["Vilnius", "Trakai"],
    radius: 40,
    lat: 54.6379,
    lng: 24.9347,
    rating: 4.6,
    reviewCount: 17,
    trustLevel: "Portfolio added",
    color: "#b95f3c",
    phone: "+370 600 45090",
    email: "ruta@localpro.lt",
    serviceArea: "Vilnius, Trakai, nestandartiniai baldai pagal susitarima",
    photos: ["Spintos", "Virtuves fasadai", "Azuolo lentynos"],
    reviews: [
      ["Greta", 5, "Tiksliai ismatavo ir pataike norima apdaila."],
      ["Andrius", 4, "Stiprus rezultatas, gamyba uztruko tris savaites."],
    ],
  },
  {
    id: "klaidas",
    name: "Klaidas Stogai",
    trade: "Stogai",
    town: "Klaipeda",
    regions: ["Klaipeda"],
    radius: 60,
    lat: 55.7033,
    lng: 21.1443,
    rating: 4.4,
    reviewCount: 15,
    trustLevel: "Phone verified",
    color: "#242926",
    phone: "+370 611 77420",
    email: "klaidas@localpro.lt",
    serviceArea: "Klaipeda, Gargzdai, Palanga, Kretinga",
    photos: ["Cerpes", "Lietvamzdziai", "Plokscias stogas"],
    reviews: [
      ["Saulius", 5, "Greitai sureagavo po audros ir siunte nuotraukas darbo metu."],
      ["Ieva", 4, "Gera kaina ir tvarkinga pabaiga."],
    ],
  },
];

const tradeFilter = document.querySelector("#tradeFilter");
const locationFilter = document.querySelector("#locationFilter");
const ratingFilter = document.querySelector("#ratingFilter");
const resultsList = document.querySelector("#resultsList");
const resultCount = document.querySelector("#resultCount");
const profilePanel = document.querySelector("#profilePanel");
const activeAreaLabel = document.querySelector("#activeAreaLabel");
const radiusRange = document.querySelector("#radiusRange");
const radiusValue = document.querySelector("#radiusValue");
const previewButton = document.querySelector("#previewRegistration");
const registrationPreview = document.querySelector("#registrationPreview");

let activeId = tradesmen[0].id;
const markerLayer = L.layerGroup();
const areaLayer = L.layerGroup();

const map = L.map("map", {
  center: [54.8, 24.4],
  zoom: 8,
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
  return "*".repeat(Math.round(rating));
}

function filteredTradesmen() {
  const trade = tradeFilter.value;
  const location = locationFilter.value;
  const rating = Number(ratingFilter.value);

  return tradesmen.filter((person) => {
    const tradeMatch = trade === "all" || person.trade === trade;
    const locationMatch = location === "all" || person.regions.includes(location);
    const ratingMatch = person.rating >= rating;
    return tradeMatch && locationMatch && ratingMatch;
  });
}

function markerIcon(person) {
  return L.divIcon({
    className: "trade-marker",
    html: `<span style="background:${person.color}"><b>${person.trade.charAt(0)}</b></span>`,
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -42],
  });
}

function popupHtml(person) {
  return `
    <div class="map-popup">
      <strong>${person.name}</strong>
      <span>${person.trade} - ${person.town}</span>
      <span>${person.rating} ivertinimas (${person.reviewCount} atsiliepimai)</span>
      <button type="button" data-profile-id="${person.id}">Atidaryti profili</button>
    </div>
  `;
}

function selectTradesman(id, shouldMoveMap = true) {
  activeId = id;
  render();

  const person = tradesmen.find((item) => item.id === id);
  if (person && shouldMoveMap) {
    map.setView([person.lat, person.lng], Math.max(map.getZoom(), 10), { animate: true });
  }

  document.querySelector("#profile").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResults(list) {
  resultCount.textContent = list.length;
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
            <span class="tag">${person.trustLevel}</span>
          </span>
          <span>${person.reviewCount} atsiliepimai - ${person.serviceArea}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".result-card").forEach((card) => {
    card.addEventListener("click", () => selectTradesman(card.dataset.id));
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
      renderResults(filteredTradesmen());
      marker.openPopup();
    });

    areaLayer.addLayer(area);
    markerLayer.addLayer(marker);
  });

  activeAreaLabel.textContent = list.length ? `${list.length} zymekliai su darbo zonomis` : "Nera atitikmenu";

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
          <span class="tag">${person.trustLevel}</span>
          <span class="rating">${person.rating} ${stars(person.rating)}</span>
        </div>
        <p>${person.reviewCount} klientu atsiliepimai. Darbo zona: ${person.serviceArea}.</p>
        <div class="verification-list">
          <span>Telefono patikra</span>
          <span>Darbu galerija</span>
          <span>Klientu ivertinimai</span>
        </div>
        <div class="contact-list">
          <a href="tel:${person.phone.replaceAll(" ", "")}"><span>Telefonas</span><strong>${person.phone}</strong></a>
          <a href="mailto:${person.email}"><span>El. pastas</span><strong>${person.email}</strong></a>
        </div>
      </div>
      <div>
        <p class="eyebrow">Darbu nuotraukos</p>
        <div class="photo-grid">
          ${person.photos
            .map(
              (photo, index) => `
                <div class="work-photo" style="--photo-color:${index === 0 ? person.color : index === 1 ? "#2f7281" : "#d59d3f"}">${photo}</div>
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
  const name = document.querySelector("#formName").value.trim() || "Naujas LocalPro meistras";
  const phone = document.querySelector("#formPhone").value.trim() || "Telefono numeris nepateiktas";
  const email = document.querySelector("#formEmail").value.trim() || "El. pastas nepateiktas";
  const town = document.querySelector("#formTown").value.trim() || "Vieta nepateikta";
  const trade = document.querySelector("#formTrade").value;
  const bio = document.querySelector("#formBio").value.trim() || "Aprasymas bus sugeneruotas is WhatsApp zinuciu.";
  const radius = radiusRange.value;

  registrationPreview.innerHTML = `
    <h3>${name}</h3>
    <div class="tag-row">
      <span class="tag">${trade}</span>
      <span class="tag">${town}</span>
      <span class="tag">${radius} km zona</span>
      <span class="tag">Laukia patvirtinimo</span>
    </div>
    <p>${bio}</p>
    <div class="contact-list">
      <a href="tel:${phone.replaceAll(" ", "")}"><span>Telefonas</span><strong>${phone}</strong></a>
      <a href="mailto:${email}"><span>El. pastas</span><strong>${email}</strong></a>
    </div>
  `;
}

function render() {
  const list = filteredTradesmen();
  if (!list.some((person) => person.id === activeId) && list.length) {
    activeId = list[0].id;
  }

  renderResults(list);
  renderMap(list);
  const activePerson = tradesmen.find((person) => person.id === activeId) || list[0] || tradesmen[0];
  renderProfile(activePerson);
}

[tradeFilter, locationFilter, ratingFilter].forEach((filter) => {
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
    selectTradesman(profileButton.dataset.profileId, false);
  }
});

render();
renderRegistrationPreview();
