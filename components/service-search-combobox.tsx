"use client";

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildServiceSearchOptions, searchServiceOptions, type ServiceSearchOption } from "../lib/service-search";
import type { Category } from "../lib/types";

type Props = {
  categories: Category[];
  value: string;
  onChange: (slug: string) => void;
};

export function ServiceSearchCombobox({ categories, value, onChange }: Props) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => buildServiceSearchOptions(categories), [categories]);
  const selected = value === "all" ? null : options.find((option) => option.slug === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => searchServiceOptions(options, query), [options, query]);
  const allOption = { id: "all" as const, kind: "category" as const, slug: "all" as const, name: "Visos sritys", categoryName: "Rodyti visus specialistus" };
  const visibleOptions: Array<ServiceSearchOption | typeof allOption> = query.trim()
    ? [...matches, allOption]
    : [allOption, ...matches];

  useEffect(() => {
    setQuery(value === "all" ? "" : selected?.name ?? "");
  }, [selected?.name, value]);

  function choose(option: (typeof visibleOptions)[number]) {
    onChange(option.slug);
    setQuery(option.slug === "all" ? "" : option.name);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => open ? Math.min(index + 1, visibleOptions.length - 1) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && visibleOptions.length) {
      event.preventDefault();
      choose(visibleOptions[activeIndex] ?? visibleOptions[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  function reset() {
    onChange("all");
    setQuery("");
    setOpen(true);
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  const activeOption = open ? visibleOptions[activeIndex] : null;

  return <div className="service-combobox-field">
    <label htmlFor={inputId}>Kokio darbo reikia?</label>
    <div className="service-combobox-input-wrap">
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        type="text"
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={activeOption ? `${listboxId}-${activeOption.id}` : undefined}
        placeholder="Pvz., sutaisyti rozetę, elektrikas, plytelių klijavimas"
        value={query}
        onFocus={() => { setOpen(true); setActiveIndex(0); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value !== "all") onChange("all");
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {query || value !== "all" ? <button className="service-combobox-clear" type="button" aria-label="Išvalyti darbo sritį" onMouseDown={(event) => event.preventDefault()} onClick={reset}>×</button> : null}
    </div>
    {open ? <div className="service-combobox-popover">
      <ul id={listboxId} role="listbox" aria-label="Darbo sričių ir paslaugų pasiūlymai">
        {visibleOptions.map((option, index) => <li
          id={`${listboxId}-${option.id}`}
          key={option.id}
          role="option"
          aria-selected={value === option.slug}
          className={index === activeIndex ? "is-active" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        >
          <strong>{option.name}</strong>
          <span>{option.categoryName}</span>
        </li>)}
      </ul>
      {query.trim() && !matches.length ? <p className="service-combobox-empty" role="status">Atitinkančių paslaugų nerasta. Pabandykite kitą frazę.</p> : null}
    </div> : null}
  </div>;
}
