"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_KEY, readAnalyticsConsent, setAnalyticsConsent, trackContact, trackPage, type AnalyticsConsent } from "../lib/analytics";
import styles from "./AnalyticsConsent.module.css";

export default function AnalyticsConsentControls() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = readAnalyticsConsent();
    setChoice(saved);
    setAnalyticsConsent(saved ?? "rejected", false);
    setLoaded(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      const next = readAnalyticsConsent();
      setAnalyticsConsent(next ?? "rejected", false);
      setChoice(next);
    };
    const contact = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const href = event.target.closest("a")?.getAttribute("href") ?? "";
      if (/^tel:/i.test(href)) trackContact("phone");
      else if (/^mailto:/i.test(href)) trackContact("email");
    };
    window.addEventListener("storage", sync);
    document.addEventListener("click", contact, true);
    return () => {
      window.removeEventListener("storage", sync);
      document.removeEventListener("click", contact, true);
    };
  }, []);

  useEffect(() => { if (loaded && choice === "accepted") trackPage(pathname ?? "/"); }, [pathname, choice, loaded]);

  function choose(next: AnalyticsConsent) {
    setAnalyticsConsent(next);
    setChoice(next);
    setEditing(false);
    settingsButton.current?.focus();
    // Immediate page view also covers a repeated acceptance without a state transition.
    if (next === "accepted") trackPage(pathname ?? "/");
  }

  return <>
    <button ref={settingsButton} type="button" className={styles.change} aria-expanded={editing || (loaded && choice === null)} aria-controls="analytics-consent" onClick={() => setEditing((value) => !value)}>Slapukų nustatymai</button>
    {loaded && (choice === null || editing) ? <section id="analytics-consent" className={styles.panel} role="region" aria-labelledby="analytics-consent-title">
      <h2 id="analytics-consent-title">Statistikos slapukai</h2>
      <p>Jums sutikus, naudosime „Google Analytics“, kad suprastume, kaip naudojama LocalPro.lt. Nesiunčiame formų turinio ar kontaktinių duomenų. Galite bet kada atsisakyti pakeisdami slapukų nustatymus. Būtinieji svetainės slapukai veikia nepriklausomai nuo šio pasirinkimo.</p>
      <a href="/privacy">Privatumo politika</a>
      <div className={styles.actions}>
        <button type="button" onClick={() => choose("accepted")}>Sutinku su statistika</button>
        <button type="button" onClick={() => choose("rejected")}>Nesutinku su statistika</button>
        {choice !== null ? <button type="button" onClick={() => { setEditing(false); settingsButton.current?.focus(); }}>Uždaryti</button> : null}
      </div>
    </section> : null}
  </>;
}
