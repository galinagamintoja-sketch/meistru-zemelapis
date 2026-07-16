"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type LoginUser = {
  email: string;
  name: string;
  picture?: string;
};

const googleClientId = "76961729881-oaec897h8tshgs511etc8ssskb0mvk21.apps.googleusercontent.com";

export default function LoginPage() {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [message, setMessage] = useState("Tikrinamas prisijungimas...");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => {
        setUser(data.user ?? null);
        setMessage(data.user ? "Prisijungta su „Google“." : "Pasirinkite „Google“ paskyrą. Slaptažodžio kurti nereikia.");
      })
      .catch(() => setMessage("Pasirinkite „Google“ paskyrą. Slaptažodžio kurti nereikia."));
  }, []);

  const renderGoogleButton = useCallback(() => {
    if (!window.google?.accounts || !buttonRef.current) {
      return;
    }

    buttonRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
      auto_select: true,
      cancel_on_tap_outside: false
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: 320
    });
    window.google.accounts.id.prompt();
  }, []);

  useEffect(() => {
    if (isReady) {
      renderGoogleButton();
    }
  }, [isReady, renderGoogleButton]);

  async function handleGoogleCredential(response: { credential?: string }) {
    if (!response.credential) {
      setMessage("„Google“ negrąžino prisijungimo kredencialo.");
      return;
    }

    setMessage("Jungiamasi...");
    const loginResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await loginResponse.json();

    if (!loginResponse.ok) {
      setMessage(data.error ?? "Nepavyko prisijungti su „Google“.");
      return;
    }

    setUser(data.user);
    setMessage("Prisijungta su „Google“.");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMessage("Atsijungta.");
    renderGoogleButton();
  }

  return (
    <main className="login-shell">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setIsReady(true)} />
      <section className="login-panel">
        <a className="brand" href="/" aria-label="LocalPro.lt">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>
            <strong>LocalPro.lt</strong>
            <small>Prisijungimas su „Google“</small>
          </span>
        </a>

        <div className="login-copy">
          <p className="eyebrow">Meistro paskyra</p>
          <h1>Prisijunkite su Google</h1>
          <p>Specialisto profilis kuriamas pagrindineje registracijos formoje. Google prisijungimas naudojamas sugrizti prie paskyros ir administruoti profili.</p>
        </div>

        {user ? (
          <div className="login-user">
            {user.picture ? <img src={user.picture} alt="" /> : <span>{user.name.charAt(0).toUpperCase()}</span>}
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        ) : (
          <div className="google-login-button" ref={buttonRef} />
        )}

        <p className="admin-message">{message}</p>

        <div className="login-actions">
          <a href="/#register">Pildyti registracijos forma</a>
          <a href="/">Tęsti į žemėlapį</a>
          <a href="/admin">Administravimas</a>
          {user ? (
            <button type="button" onClick={logout}>
              Atsijungti
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
