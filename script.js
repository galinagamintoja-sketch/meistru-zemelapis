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
const pinLayer = document.querySelector("#pinLayer");
const serviceAreas = document.querySelector("#serviceAreas");
const profilePanel = document.querySelector("#profilePanel");
const activeAreaLabel = document.querySelector("#activeAreaLabel");
const radiusRange = document.querySelector("#radiusRange");
const radiusValue = document.querySelector("#radiusValue");

let activeId = tradesmen[0].id;

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
    pin.addEventListener("click", () => selectTradesman(pin.dataset.id));
  });

  activeAreaLabel.textContent = list.length ? "Service areas visible" : "No matching areas";
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

render();
