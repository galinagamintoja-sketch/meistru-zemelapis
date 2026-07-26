"use client";

import { useEffect, useRef } from "react";

export function OperatingAreaMap({ latitude, longitude, radiusKm, city }: { latitude: number | null; longitude: number | null; radiusKm: number; city: string }) {
  const element = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!element.current) return;
    let map: import("leaflet").Map | undefined;
    void import("leaflet").then((leaflet) => {
      if (!element.current) return;
      const center: [number, number] = [latitude ?? 54.6872, longitude ?? 25.2797];
      map = leaflet.map(element.current, { zoomControl: true, attributionControl: true }).setView(center, 9);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(map);
      leaflet.circle(center, { radius: radiusKm * 1000, color: "#20785b", fillColor: "#6cc49f", fillOpacity: .18, weight: 2 }).addTo(map);
      leaflet.marker(center).addTo(map).bindTooltip(city, { permanent: false });
    });
    return () => { map?.remove(); };
  }, [city, latitude, longitude, radiusKm]);
  return <div className="portal-map" ref={element} aria-label={`${city} aptarnavimo zona, ${radiusKm} km`} />;
}
