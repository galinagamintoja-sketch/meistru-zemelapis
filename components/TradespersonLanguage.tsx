"use client";

import { useEffect, useState } from "react";
import { translateTradespersonText } from "../lib/tradesperson-ru";

const cookieName = "localpro_tradesperson_language";
type Locale = "lt" | "ru";

function selectedLocale(): Locale {
  return document.cookie.split("; ").find((part) => part.startsWith(`${cookieName}=`))?.split("=")[1] === "ru" ? "ru" : "lt";
}

export function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>("lt");
  useEffect(() => setLocale(selectedLocale()), []);
  return <div className="tradesperson-language-switch" role="group" aria-label={locale === "ru" ? "Язык интерфейса" : "Sąsajos kalba"} data-no-translate>
    <button type="button" lang="lt" aria-label="Lietuvių kalba" aria-pressed={locale === "lt"} onClick={() => changeLocale("lt")}>LT</button>
    <button type="button" lang="ru" aria-label="Русский язык" aria-pressed={locale === "ru"} onClick={() => changeLocale("ru")}>RU</button>
  </div>;
}

function changeLocale(locale: Locale) {
  document.cookie = `${cookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
}

// This applies the interface dictionary to the existing tradesperson UI,
// including content produced after form submissions and client-side navigation.
// Exact matching protects user-entered names/descriptions from translation.
export function TranslationController() {
  useEffect(() => {
    if (selectedLocale() !== "ru") return;
    const root = document.querySelector("[data-tradesperson-language-surface]");
    if (!root) return;
    root.setAttribute("lang", "ru");
    const previousHtmlLang = document.documentElement.lang;
    document.documentElement.lang = "ru";
    const textState = new WeakMap<Text, { source: string; translated: string }>();
    const attributeState = new WeakMap<Element, Map<string, { source: string; translated: string }>>();
    const attributes = ["aria-label", "placeholder", "title"];

    function translate(rootNode: Node) {
      if (rootNode instanceof Element && rootNode.closest("[data-no-translate]")) return;
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null = rootNode;
      while (node) {
        if (node instanceof Text) {
          const parent = node.parentElement;
          if (parent && !parent.closest("[data-no-translate], script, style, textarea")) {
            const old = textState.get(node);
            const source = old && node.data === old.translated ? old.source : node.data;
            const translated = translateTradespersonText(source);
            textState.set(node, { source, translated });
            if (node.data !== translated) node.data = translated;
          }
        } else if (node instanceof Element && !node.closest("[data-no-translate]")) {
          const previous = attributeState.get(node) ?? new Map();
          for (const name of attributes) {
            const current = node.getAttribute(name);
            if (current === null) continue;
            const old = previous.get(name);
            const source = old && current === old.translated ? old.source : current;
            const translated = translateTradespersonText(source);
            previous.set(name, { source, translated });
            if (current !== translated) node.setAttribute(name, translated);
          }
          attributeState.set(node, previous);
        }
        node = walker.nextNode();
      }
    }

    translate(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" || mutation.type === "attributes") translate(mutation.target);
        else mutation.addedNodes.forEach(translate);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => { observer.disconnect(); document.documentElement.lang = previousHtmlLang; };
  }, []);
  return null;
}
