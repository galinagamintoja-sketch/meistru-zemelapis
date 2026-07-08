"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type LoginUser = {
  email: string;
  name: string;
  picture?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

const googleClientId = "76961729881-oaec897h8tshgs511etc8ssskb0mvk21.apps.googleusercontent.com";

export default function LoginPage() {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [message, setMessage] = useState("Checking login...");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => {
        setUser(data.user ?? null);
        setMessage(data.user ? "Logged in with Google." : "Choose a Google account to continue.");
      })
      .catch(() => setMessage("Choose a Google account to continue."));
  }, []);

  useEffect(() => {
    if (isReady) {
      renderGoogleButton();
    }
  }, [isReady]);

  function renderGoogleButton() {
    if (!window.google || !buttonRef.current) {
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
  }

  async function handleGoogleCredential(response: { credential?: string }) {
    if (!response.credential) {
      setMessage("Google did not return a login credential.");
      return;
    }

    setMessage("Signing in...");
    const loginResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await loginResponse.json();

    if (!loginResponse.ok) {
      setMessage(data.error ?? "Google login failed.");
      return;
    }

    setUser(data.user);
    setMessage("Logged in with Google.");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMessage("Logged out.");
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
            <small>Google login</small>
          </span>
        </a>

        <div className="login-copy">
          <p className="eyebrow">Fast login</p>
          <h1>Welcome back</h1>
          <p>Use your Google account to continue to LocalPro.lt.</p>
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
          <a href="/">Continue to map</a>
          <a href="/admin">Admin</a>
          {user ? (
            <button type="button" onClick={logout}>
              Logout
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
