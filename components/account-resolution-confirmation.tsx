"use client";

import { useState } from "react";

export function AccountResolutionConfirmation() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setMessage("Paskyra susiejama...");
    try {
      const response = await fetch("/api/meistras/resolve-account", { method: "POST" });
      const data = await response.json();
      if (response.ok && data.dashboardUrl) window.location.assign(data.dashboardUrl);
      else setMessage(data.error ?? "Paskyros susieti nepavyko.");
    } catch {
      setMessage("Paskyros susieti nepavyko. Patikrinkite ryšį ir bandykite dar kartą.");
    } finally {
      setPending(false);
    }
  }

  return <div className="portal-actions">
    <button className="portal-primary" type="button" onClick={confirm} disabled={pending}>Atidaryti paskyrą</button>
    <p role="status">{message}</p>
  </div>;
}

