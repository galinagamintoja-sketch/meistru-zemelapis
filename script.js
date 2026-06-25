const tradesmen = [
  {
    id: "jonas",
    name: "Jonas Apdaila",
    trade: "Painter",
    town: "Lentvaris",
    regions: ["Vilnius", "Trakai"],
    radius: 35,
    lat: 54.6476,
    lng: 25.0513,
    rating: 4.9,
    reviewCount: 38,
    color: "#256c4f",
    phone: "+370 636 01230",
    email: "jonas@meistrai.lt",
    serviceArea: "Lentvaris + 35 km radius, Vilnius and Trakai districts",
    photos: ["Interior repaint", "Facade refresh", "Wood staining"],
    reviews: [
      ["Rasa", 5, "Clean work, arrived on time, protected floors properly."],
      ["Mindaugas", 5, "Good communication and fair price for two rooms."],
    ],
  },
  {
    id: "darius",
    name: "Darius Santechnika",
    trade: "Plumber",
    town: "Vilnius",
    regions: ["Vilnius"],
    radius: 25,
    lat: 54.6872,
    lng: 25.2797,
    rating: 4.7,
    reviewCount: 24,
    color: "#4078a8",
    phone: "+370 612 22110",
    email: "darius@meistrai.lt",
    serviceArea: "Vilnius city and 25 km around it",
    photos: ["Bathroom pipework", "Boiler install", "Leak repair"],
    reviews: [
      ["Tomas", 5, "Solved a leak the same day and explained the options."],
      ["Aiste", 4, "Professional work, slightly later than planned."],
    ],
  },
  {
    id: "marius",
    name: "Marius Elektra",
    trade: "Electrician",
    town: "Kaunas",
    regions: ["Kaunas"],
    radius: 45,
    lat: 54.8985,
    lng: 23.9036,
    rating: 4.8,
    reviewCount: 31,
    color: "#cc8b22",
    phone: "+370 699 48331",
    email: "marius@meistrai.lt",
    serviceArea: "Kaunas city, Kaunas district, Jonava direction",
    photos: ["Fuse board", "LED lighting", "Socket layout"],
    reviews: [
      ["Laura", 5, "Neat wiring and clear invoice."],
      ["Paulius", 5, "Helped plan sockets before renovation started."],
    ],
  },
  {
    id: "ruta",
    name: "Ruta Staliaus Darbai",
    trade: "Carpenter",
    town: "Trakai",
    regions: ["Vilnius", "Trakai"],
    radius: 40,
    lat: 54.6379,
    lng: 24.9347,
    rating: 4.6,
    reviewCount: 17,
    color: "#b7603b",
    phone: "+370 600 45090",
    email: "ruta@meistrai.lt",
    serviceArea: "Vilnius, Trakai, custom furniture pickup by agreement",
    photos: ["Wardrobes", "Kitchen fronts", "Oak shelves"],
    reviews: [
      ["Greta", 5, "Measured carefully and matched the finish we wanted."],
      ["Andrius", 4, "Strong result, lead time was three weeks."],
    ],
  },
  {
    id: "klaidas",
    name: "Klaidas Stogai",
    trade: "Roofer",
    town: "Klaipeda",
    regions: ["Klaipeda"],
    radius: 60,
    lat: 55.7033,
    lng: 21.1443,
    rating: 4.4,
    reviewCount: 15,
    color: "#5f6d66",
    phone: "+370 611 77420",
    email: "klaidas@meistrai.lt",
    serviceArea: "Klaipeda city, Gargzdai, Palanga, Kretinga",
    photos: ["Roof tiles", "Gutter repair", "Flat roof"],
    reviews: [
      ["Saulius", 5, "Quick after storm damage and sent photos during work."],
      ["Ieva", 4, "Good price and tidy finish."],
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
      <span>${person.trade} in ${person.town}</span>
      <span>${person.rating} rating (${person.reviewCount} reviews)</span>
      <button type="button" data-profile-id="${person.id}">Open profile</button>
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
            <span class="tag">${person.radius} km area</span>
          </span>
          <span>${person.reviewCount} reviews - ${person.serviceArea}</span>
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

  activeAreaLabel.textContent = list.length ? `${list.length} pins with service areas` : "No matching tradesmen";

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
        <p class="eyebrow">Selected professional</p>
        <h2>${person.name}</h2>
        <div class="tag-row">
          <span class="tag">${person.trade}</span>
          <span class="tag">${person.town}</span>
          <span class="rating">${person.rating} ${stars(person.rating)}</span>
        </div>
        <p>${person.reviewCount} customer reviews. Service area: ${person.serviceArea}.</p>
        <div class="contact-list">
          <a href="tel:${person.phone.replaceAll(" ", "")}"><span>Phone</span><strong>${person.phone}</strong></a>
          <a href="mailto:${person.email}"><span>Email</span><strong>${person.email}</strong></a>
        </div>
      </div>
      <div>
        <p class="eyebrow">Work photos</p>
        <div class="photo-grid">
          ${person.photos
            .map(
              (photo, index) => `
                <div class="work-photo" title="${photo}" style="--photo-color:${index === 0 ? person.color : index === 1 ? "#4078a8" : "#cc8b22"}"></div>
              `,
            )
            .join("")}
        </div>
        <p class="eyebrow">Reviews</p>
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
});

document.addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-profile-id]");
  if (profileButton) {
    selectTradesman(profileButton.dataset.profileId, false);
  }
});

render();
