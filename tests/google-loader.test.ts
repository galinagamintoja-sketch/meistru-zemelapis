import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ScriptStub = {
  async?: boolean;
  defer?: boolean;
  dataset: Record<string, string>;
  onerror?: () => void;
  src?: string;
  addEventListener: (event: string, callback: () => void) => void;
};

function installDomStub() {
  const scripts: ScriptStub[] = [];
  const listeners = new Map<string, () => void>();

  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    google: undefined
  });
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === "script[data-localpro-google-places]"
        ? scripts.find((script) => script.dataset.localproGooglePlaces)
        : null,
    createElement: () => ({
      dataset: {},
      addEventListener: (event: string, callback: () => void) => listeners.set(event, callback)
    }),
    head: {
      appendChild: (script: ScriptStub) => scripts.push(script)
    }
  });

  return { scripts, listeners };
}

async function importLoader() {
  process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY = "test-browser-key";
  vi.resetModules();
  return import("../components/AddressAutocomplete");
}

describe("Google Maps script loader", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  });

  it("does not resolve from script.onload alone", async () => {
    const { scripts } = installDomStub();
    const { loadGooglePlacesScript } = await importLoader();

    const promise = loadGooglePlacesScript();
    const script = scripts[0];

    expect(script.src).toContain("callback=__localproGooglePlacesReady");
    expect(script).not.toHaveProperty("onload");

    const state = await Promise.race([
      promise.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 0))
    ]);
    expect(state).toBe("pending");

    script.onerror?.();
    await expect(promise).rejects.toThrow("Google Places failed to load.");
  });

  it("resolves only when the Google callback confirms importLibrary exists", async () => {
    const { scripts } = installDomStub();
    const { loadGooglePlacesScript } = await importLoader();

    const promise = loadGooglePlacesScript();

    expect(scripts).toHaveLength(1);
    expect(window.__localproGooglePlacesReady).toBeTypeOf("function");

    window.google = {
      maps: {
        importLibrary: vi.fn(),
        Geocoder: vi.fn()
      }
    };
    window.__localproGooglePlacesReady?.();

    await expect(promise).resolves.toBeUndefined();
    expect(window.__localproGooglePlacesReady).toBeUndefined();
  });
});
