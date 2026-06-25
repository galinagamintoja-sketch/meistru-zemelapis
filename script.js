const tradesmen = [
  {
    id: "jonas",
    name: "Jonas Apdaila",
    trade: "Painter",
    town: "Lentvaris",
    regions: ["Vilnius", "Trakai"],
    radius: 35,
    x: 43,
    y: 49,
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
    x: 57,
    y: 39,
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
    x: 22,
    y: 27,
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
    town: "Vilnius",
    regions: ["Vilnius", "Trakai"],
    radius: 40,
    x: 49,
    y: 57,
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
    x: 75,
    y: 76,
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
const map = document.querySelector("#map");
const mapCanvas = document.querySelector("#mapCanvas");
const pinLayer = document.querySelector("#pinLayer");
const serviceAreas = document.querySelector("#serviceAreas");
const profilePanel = document.querySelector("#profilePanel");
const activeAreaLabel = document.querySelector("#activeAreaLabel");
const radiusRange = document.querySelector("#radiusRange");
const radiusValue = document.querySelector("#radiusValue");
const zoomInButton = document.querySelector("#zoomIn");
const zoomOutButton = document.querySelector("#zoomOut");
const resetMapButton = document.querySelector("#resetMap");

let activeId = tradesmen[0].id;
const mapState = {
  scale: 1,
  x: 0,
  y: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  startX: 0,
  startY: 0,
  activePointers: new Map(),
  pinchStartDistance: 0,
  pinchStartScale: 1,
};

function stars(rating) {
  const fullStars = Math.round(rating);
  return "★★★★★".slice(0, fullStars) + "☆☆☆☆☆".slice(0, 5 - fullStars);
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

function selectTradesman(id) {
  activeId = id;
  render();
  document.querySelector("#profile").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateMapTransform() {
  mapCanvas.style.transform = `translate(calc(-50% + ${mapState.x}px), calc(-50% + ${mapState.y}px)) scale(${mapState.scale})`;
  activeAreaLabel.textContent = `Zoom ${Math.round(mapState.scale * 100)}%`;
}

function zoomMap(delta, originX = map.clientWidth / 2, originY = map.clientHeight / 2) {
  const oldScale = mapState.scale;
  const nextScale = clamp(oldScale + delta, 0.75, 2.35);

  if (nextScale === oldScale) {
    return;
  }

  const mapRect = map.getBoundingClientRect();
  const offsetX = originX - mapRect.width / 2;
  const offsetY = originY - mapRect.height / 2;
  const ratio = nextScale / oldScale;

  mapState.x = offsetX - (offsetX - mapState.x) * ratio;
  mapState.y = offsetY - (offsetY - mapState.y) * ratio;
  mapState.scale = nextScale;
  updateMapTransform();
}

function resetMap() {
  mapState.scale = 1;
  mapState.x = 0;
  mapState.y = 0;
  updateMapTransform();
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
            <span class="tag">${person.radius} km</span>
          </span>
          <span>${person.reviewCount} reviews · ${person.serviceArea}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".result-card").forEach((card) => {
    card.addEventListener("click", () => selectTradesman(card.dataset.id));
  });
}

function renderMap(list) {
  serviceAreas.innerHTML = list
    .map((person) => {
      const size = Math.max(95, person.radius * 4.2);
      return `
        <span
          class="service-area"
          style="left:${person.x}%; top:${person.y}%; width:${size}px; height:${size}px; --area-color:${person.color};"
          aria-hidden="true">
        </span>
      `;
    })
    .join("");

  pinLayer.innerHTML = list
    .map(
      (person) => `
        <button
          class="pin ${person.id === activeId ? "active" : ""}"
          style="left:${person.x}%; top:${person.y}%; --pin-color:${person.color};"
          data-id="${person.id}"
          type="button"
          aria-label="${person.name}, ${person.trade}">
          <span>${person.trade.charAt(0)}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".pin").forEach((pin) => {
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      selectTradesman(pin.dataset.id);
    });
  });
  updateMapTransform();
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

zoomInButton.addEventListener("click", () => zoomMap(0.2));
zoomOutButton.addEventListener("click", () => zoomMap(-0.2));
resetMapButton.addEventListener("click", resetMap);

map.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    const direction = event.deltaY > 0 ? -0.12 : 0.12;
    zoomMap(direction, event.clientX - rect.left, event.clientY - rect.top);
  },
  { passive: false },
);

map.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) {
    return;
  }

  mapState.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  map.setPointerCapture(event.pointerId);
  map.classList.add("dragging");
  mapState.isDragging = true;
  mapState.dragStartX = event.clientX;
  mapState.dragStartY = event.clientY;
  mapState.startX = mapState.x;
  mapState.startY = mapState.y;

  if (mapState.activePointers.size === 2) {
    const pointers = [...mapState.activePointers.values()];
    mapState.pinchStartDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    mapState.pinchStartScale = mapState.scale;
  }
});

map.addEventListener("pointermove", (event) => {
  if (mapState.activePointers.has(event.pointerId)) {
    mapState.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (!mapState.isDragging) {
    return;
  }

  if (mapState.activePointers.size === 2) {
    const rect = map.getBoundingClientRect();
    const pointers = [...mapState.activePointers.values()];
    const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    const midpointX = (pointers[0].x + pointers[1].x) / 2 - rect.left;
    const midpointY = (pointers[0].y + pointers[1].y) / 2 - rect.top;
    const nextScale = clamp(mapState.pinchStartScale * (distance / mapState.pinchStartDistance), 0.75, 2.35);
    zoomMap(nextScale - mapState.scale, midpointX, midpointY);
    return;
  }

  mapState.x = mapState.startX + event.clientX - mapState.dragStartX;
  mapState.y = mapState.startY + event.clientY - mapState.dragStartY;
  updateMapTransform();
});

map.addEventListener("pointerup", (event) => {
  mapState.activePointers.delete(event.pointerId);
  mapState.isDragging = false;
  map.classList.remove("dragging");
  if (map.hasPointerCapture(event.pointerId)) {
    map.releasePointerCapture(event.pointerId);
  }
});

map.addEventListener("pointercancel", (event) => {
  mapState.activePointers.delete(event.pointerId);
  mapState.isDragging = false;
  map.classList.remove("dragging");
});

map.addEventListener("dblclick", (event) => {
  const rect = map.getBoundingClientRect();
  zoomMap(0.25, event.clientX - rect.left, event.clientY - rect.top);
});

render();
