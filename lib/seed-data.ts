import type { Category, Specialist } from "./types";

export const categories: Category[] = [
  {
    id: "cat-apdaila",
    name: "Apdaila",
    slug: "apdaila",
    subcategories: [
      { id: "sub-dazymas", name: "Dažymas", slug: "dazymas" },
      { id: "sub-glaistymas", name: "Glaistymas", slug: "glaistymas" },
      { id: "sub-grindys", name: "Grindys", slug: "grindys" }
    ]
  },
  {
    id: "cat-santechnika",
    name: "Santechnika",
    slug: "santechnika",
    subcategories: [
      { id: "sub-vonios", name: "Vonios remontas", slug: "vonios-remontas" },
      { id: "sub-vamzdynai", name: "Vamzdynai", slug: "vamzdynai" }
    ]
  },
  {
    id: "cat-elektra",
    name: "Elektra",
    slug: "elektra",
    subcategories: [
      { id: "sub-instaliacija", name: "Instaliacija", slug: "instaliacija" },
      { id: "sub-apsvietimas", name: "Apšvietimas", slug: "apsvietimas" }
    ]
  },
  {
    id: "cat-staliai",
    name: "Staliaus darbai",
    slug: "staliaus-darbai",
    subcategories: [
      { id: "sub-baldai", name: "Nestandartiniai baldai", slug: "nestandartiniai-baldai" },
      { id: "sub-terasos", name: "Terasos", slug: "terasos" }
    ]
  },
  {
    id: "cat-stogai",
    name: "Stogai",
    slug: "stogai",
    subcategories: [
      { id: "sub-danga", name: "Stogo danga", slug: "stogo-danga" },
      { id: "sub-lietvamzdziai", name: "Lietvamzdžiai", slug: "lietvamzdziai" }
    ]
  },
  {
    id: "cat-aplinka",
    name: "Trinkelės ir aplinka",
    slug: "trinkeles-ir-aplinka",
    subcategories: [
      { id: "sub-trinkeles", name: "Trinkelės", slug: "trinkeles" },
      { id: "sub-gerbuvis", name: "Gerbūvis", slug: "gerbuvis" }
    ]
  },
  {
    id: "cat-renovacija",
    name: "Pilna renovacija",
    slug: "pilna-renovacija",
    subcategories: [
      { id: "sub-butai", name: "Butų renovacija", slug: "butu-renovacija" },
      { id: "sub-namai", name: "Namų renovacija", slug: "namu-renovacija" }
    ]
  }
];

export const specialists: Specialist[] = [
  {
    id: "jonas",
    name: "Jonas Apdaila",
    trade: "Apdaila",
    categorySlug: "apdaila",
    subcategorySlugs: ["dazymas", "glaistymas"],
    town: "Vilnius",
    operatingCities: ["Vilnius", "Kaunas"],
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
    description: "Vidaus apdaila, glaistymas, dažymas ir grindų darbai.",
    photos: ["Vidaus dažymas", "Fasado atnaujinimas", "Medžio alyvavimas"],
    reviews: [
      ["Rasa", 5, "Tvarkingas darbas, atvyko sutartu laiku, apsaugojo grindis."],
      ["Mindaugas", 5, "Aiški komunikacija ir sąžininga kaina už du kambarius."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "darius",
    name: "Darius Santechnika",
    trade: "Santechnika",
    categorySlug: "santechnika",
    subcategorySlugs: ["vamzdynai", "vonios-remontas"],
    town: "Kaunas",
    operatingCities: ["Kaunas", "Marijampolė"],
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
    description: "Santechnikos remontas, boileriai, vonios kambariai ir vamzdynai.",
    photos: ["Vonios vamzdynas", "Boilerio montavimas", "Nuotėkio remontas"],
    reviews: [
      ["Tomas", 5, "Nuotėkį sutvarkė tą pačią dieną ir paaiškino pasirinkimus."],
      ["Aistė", 4, "Profesionalus darbas, tik šiek tiek vėlavo."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "marius",
    name: "Marius Elektra",
    trade: "Elektra",
    categorySlug: "elektra",
    subcategorySlugs: ["instaliacija", "apsvietimas"],
    town: "Klaipėda",
    operatingCities: ["Klaipėda", "Telšiai"],
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
    description: "Elektros instaliacija, apšvietimas, skydinės ir rozečių planai.",
    photos: ["Skydinė", "LED apšvietimas", "Rozečių planas"],
    reviews: [
      ["Laura", 5, "Tvarkingi laidai ir aiški sąskaita."],
      ["Paulius", 5, "Padėjo suplanuoti rozečių vietas prieš remontą."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "ruta",
    name: "Rūta Staliaus Darbai",
    trade: "Staliaus darbai",
    categorySlug: "staliaus-darbai",
    subcategorySlugs: ["nestandartiniai-baldai"],
    town: "Šiauliai",
    operatingCities: ["Šiauliai", "Panevėžys"],
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
    description: "Nestandartiniai baldai, spintos, fasadai ir medžio detalės.",
    photos: ["Spintos", "Virtuvės fasadai", "Ąžuolo lentynos"],
    reviews: [
      ["Greta", 5, "Tiksliai išmatavo ir pataikė norimą apdailą."],
      ["Andrius", 4, "Stiprus rezultatas, gamyba užtruko tris savaites."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "klaidas",
    name: "Klaidas Stogai",
    trade: "Stogai",
    categorySlug: "stogai",
    subcategorySlugs: ["stogo-danga", "lietvamzdziai"],
    town: "Panevėžys",
    operatingCities: ["Panevėžys", "Utena"],
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
    description: "Stogų remontas, dangos keitimas, lietvamzdžiai ir avariniai darbai.",
    photos: ["Čerpės", "Lietvamzdžiai", "Plokščias stogas"],
    reviews: [
      ["Saulius", 5, "Greitai sureagavo po audros ir siuntė nuotraukas darbo metu."],
      ["Ieva", 4, "Gera kaina ir tvarkinga pabaiga."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "asta",
    name: "Asta Trinkelės ir Aplinka",
    trade: "Trinkelės ir aplinka",
    categorySlug: "trinkeles-ir-aplinka",
    subcategorySlugs: ["trinkeles", "gerbuvis"],
    town: "Alytus",
    operatingCities: ["Alytus", "Marijampolė"],
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
    description: "Trinkelių klojimas, bortai, terasų pagrindai ir gerbūvis.",
    photos: ["Trinkelės", "Terasos pagrindas", "Aplinkos bortai"],
    reviews: [
      ["Dovilė", 5, "Aiškus terminas ir labai tvarkinga aikštelė po darbų."],
      ["Karolis", 5, "Pasiūlė geresnį nuolydį vandeniui nubėgti."]
    ],
    status: "approved",
    source: "admin-created"
  },
  {
    id: "vytautas",
    name: "Vytautas Pilna Renovacija",
    trade: "Pilna renovacija",
    categorySlug: "pilna-renovacija",
    subcategorySlugs: ["butu-renovacija", "namu-renovacija"],
    town: "Utena",
    operatingCities: ["Utena", "Vilnius"],
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
    description: "Butų ir namų renovacija, darbų koordinavimas, šiltinimas.",
    photos: ["Butų renovacija", "Šiltinimas", "Mazgų tvarkymas"],
    reviews: [
      ["Eglė", 5, "Suderino meistrus ir laikėsi biudžeto."],
      ["Nerijus", 5, "Puikiai paaiškino energinio efektyvumo pasirinkimus."]
    ],
    status: "approved",
    source: "admin-created"
  }
];
