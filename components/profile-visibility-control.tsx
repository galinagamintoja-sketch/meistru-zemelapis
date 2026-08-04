"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileVisibilityControl({ visible }: { visible: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function changeVisibility() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/meistras/visibility", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visible: !visible })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(data.validationErrors) ? data.validationErrors.join(" ") : "";
        setMessage([data.error ?? "Profilio matomumo pakeisti nepavyko.", details].filter(Boolean).join(" "));
        return;
      }
      setMessage(visible ? "Profilis laikinai paslėptas." : "Profilis vėl rodomas viešai.");
      router.refresh();
    } catch {
      setMessage("Profilio matomumo pakeisti nepavyko. Bandykite dar kartą.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="profile-visibility-control">
      <button className="portal-secondary" type="button" disabled={pending} onClick={changeVisibility}>
        {pending ? "Saugoma..." : visible ? "Laikinai paslėpti profilį" : "Vėl rodyti profilį"}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}
