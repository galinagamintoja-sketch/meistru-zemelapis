"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./JobsPageClient.module.css";
import type { FirstJobPage, PublicJob, PublicJobFilters, PublicJobTaxonomy } from "../lib/public-jobs-first-page";

type Taxonomy = PublicJobTaxonomy;
type Job = PublicJob;
type Feed = { jobs?: Job[]; next_cursor?: string | null; has_more?: boolean; gated?: boolean; profile_required?: boolean; error?: string };
const periods = [{ value: "all", label: "Visi naujausi" }, { value: "1d", label: "Per 24 val." },
  { value: "3d", label: "Per 3 dienas" }, { value: "7d", label: "Per 7 dienas" }];
type Filters = PublicJobFilters;
const defaultFilters: Filters = { trade: "", area: "", period: "all", contactOnly: false };
const historyKey = (values: Filters) =>
  `localpro-jobs-pages:${values.trade}|${values.area}|${values.period}|${values.contactOnly}`;

function paramsFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return { trade: params.get("trade") ?? "", area: params.get("area") ?? "", period: params.get("period") ?? "all",
    contactOnly: params.get("contact_number") === "true" };
}

export default function JobsPageClient({ initialFilters, initialFeed, initialTaxonomy, initialAccess }: { initialFilters?: Filters; initialFeed?: FirstJobPage; initialTaxonomy?: Taxonomy; initialAccess?: "guest" | "registration" | "ready" | null }) {
  const router = useRouter();
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(initialTaxonomy ?? { trades: [], areas: [] });
  const [filters, setFilters] = useState<Filters>(initialFilters ?? defaultFilters);
  const [jobs, setJobs] = useState<Job[]>(initialFeed?.jobs ?? []);
  const [cursor, setCursor] = useState<string | null>(initialFeed?.next_cursor ?? null);
  const [hasMore, setHasMore] = useState(Boolean(initialFeed?.has_more));
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(!initialFeed);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const currentFilters = useRef(filters);
  const registrationDialog = useRef<HTMLDialogElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { currentFilters.current = filters; }, [filters]);
  useEffect(() => {
    if (gated && !registrationDialog.current?.open) registrationDialog.current?.showModal();
  }, [gated]);

  const load = useCallback(async (nextCursor: string | null, replace: boolean, values = currentFilters.current, replayAction?: string): Promise<Feed | null> => {
    if (busy.current && !replace) return null;
    busy.current = true;
    const requestNumber = ++sequence.current;
    setLoading(true); setError(false);
    try {
      const query = new URLSearchParams();
      if (values.trade) query.set("trade", values.trade);
      if (values.area) query.set("area", values.area);
      if (values.period !== "all") query.set("period", values.period);
      if (values.contactOnly) query.set("contact_number", "true");
      const pendingKey = nextCursor ? `localpro-jobs-pending:${historyKey(values)}|${nextCursor}` : null;
      const actionId = nextCursor ? replayAction ?? (pendingKey && sessionStorage.getItem(pendingKey)) ?? crypto.randomUUID() : null;
      if (pendingKey && actionId && !replayAction) sessionStorage.setItem(pendingKey, actionId);
      if (nextCursor && actionId) { query.set("cursor", nextCursor); query.set("action_id", actionId); }
      const response = await fetch(`/api/jobs/feed?${query}`, { cache: "no-store" });
      const feed = await response.json() as Feed;
      if (!response.ok || feed.error) throw new Error("feed_failed");
      if (requestNumber !== sequence.current) return null;
      if (feed.gated) {
        if (pendingKey) sessionStorage.removeItem(pendingKey);
        if (feed.profile_required) router.push(`/meistro-registracija?next=${encodeURIComponent(`/darbu-skelbimai${window.location.search}`)}`);
        else setGated(true);
        return feed;
      }
      setGated(false);
      setJobs((before) => {
        const merged = replace ? feed.jobs ?? [] : [...before, ...(feed.jobs ?? [])];
        return Array.from(new Map(merged.map((item) => [item.id, item])).values());
      });
      setCursor(feed.next_cursor ?? null); setHasMore(Boolean(feed.has_more));
      if (pendingKey) sessionStorage.removeItem(pendingKey);
      if (nextCursor && actionId && !replayAction && feed.jobs?.length) {
        const key = historyKey(values);
        let history: Array<{ cursor: string; actionId: string }> = [];
        try { history = JSON.parse(sessionStorage.getItem(key) ?? "[]"); } catch { /* ignore stale state */ }
        sessionStorage.setItem(key, JSON.stringify([...history, { cursor: nextCursor, actionId }].slice(0, 30)));
      }
      return feed;
    } catch {
      if (requestNumber === sequence.current) setError(true);
      return null;
    } finally {
      if (requestNumber === sequence.current) { setLoading(false); busy.current = false; }
    }
  }, [router]);

  useEffect(() => {
    const initial = paramsFromLocation();
    setFilters(initial);
    void (async () => {
      const matchesServer = initialFeed && initialFilters && historyKey(initial) === historyKey(initialFilters);
      const first = matchesServer ? initialFeed : await load(null, true, initial);
      if (!first || ("error" in first && first.error)) return;
      let history: Array<{ cursor: string; actionId: string }> = [];
      try { history = JSON.parse(sessionStorage.getItem(historyKey(initial)) ?? "[]"); } catch { /* ignore stale state */ }
      for (const item of history.slice(0, 20)) {
        if (!item?.cursor || !item?.actionId) break;
        const result = await load(item.cursor, false, initial, item.actionId);
        if (!result || result.gated || result.error) break;
      }
      const scroll = Number(sessionStorage.getItem(`localpro-jobs-scroll:${historyKey(initial)}`));
      if (scroll > 0) window.scrollTo({ top: scroll, behavior: "instant" });
    })();
    if (!initialTaxonomy) fetch("/api/jobs/taxonomy").then((response) => response.json()).then((data: Taxonomy) => {
      if (Array.isArray(data.trades) && Array.isArray(data.areas)) setTaxonomy(data);
    }).catch(() => {});
  }, [load, initialFeed, initialFilters, initialTaxonomy]);

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    const updated = { ...filters, [key]: value };
    setFilters(updated); setJobs([]); setCursor(null); setHasMore(false); setGated(false);
    const query = new URLSearchParams();
    if (updated.trade) query.set("trade", updated.trade);
    if (updated.area) query.set("area", updated.area);
    if (updated.period !== "all") query.set("period", updated.period);
    if (updated.contactOnly) query.set("contact_number", "true");
    window.history.replaceState(null, "", `/darbu-skelbimai${query.size ? `?${query}` : ""}`);
    busy.current = false;
    void load(null, true, updated);
  }

  const loginNext = `/darbu-skelbimai${typeof window !== "undefined" ? window.location.search : ""}`;
  const rememberScroll = () => sessionStorage.setItem(`localpro-jobs-scroll:${historyKey(filters)}`, String(window.scrollY));
  return <main className={styles.shell}>
    <div className={styles.top}><Link href="/">← LocalPro</Link></div>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>LocalPro</p><h1>Darbų skelbimai</h1>
      <p>Naujausi darbų užsakymai pagal amatą ir vietovę. Pasirinkite skelbimą ir susisiekite per originalų įrašą.</p>
    </header>
    <section className={styles.filters} aria-label="Skelbimų filtrai">
      <label>Darbų sritis<select value={filters.trade} onChange={(event) => changeFilter("trade", event.target.value)}>
        <option value="">Visos sritys</option>{taxonomy.trades.map((trade) => <option key={trade.id} value={trade.id}>{trade.name} ({trade.count})</option>)}
      </select></label>
      <label>Miestas ar rajonas<select value={filters.area} onChange={(event) => changeFilter("area", event.target.value)}>
        <option value="">Visos vietovės</option>{taxonomy.areas.map((area) => <option key={area.id} value={area.id}>{area.name} ({area.count})</option>)}
      </select></label>
      <label>Laikotarpis<select value={filters.period} onChange={(event) => changeFilter("period", event.target.value)}>
        {periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
      </select></label>
      <label className={styles.contactFilter}><input type="checkbox" checked={filters.contactOnly}
        onChange={(event) => changeFilter("contactOnly", event.target.checked)} />
        Tik skelbimai su telefono numeriu</label>
    </section>
    <p className={styles.note}>Įrašas atsidarys „Facebook“. Gali reikėti prisijungti; darbas jau gali būti užimtas.</p>
    <section className={styles.list} aria-live="polite">
      {jobs.map((job) => <article className={styles.card} key={job.id}>
        <div className={styles.meta}><span>{job.areas.map((area) => area.name).join(", ")}</span>
          <time dateTime={job.posted_at}>{new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", dateStyle: "medium" }).format(new Date(job.posted_at))}</time></div>
        <h2>{job.title}</h2><p>{job.summary}</p>
        <div className={styles.tags}>{job.trades.map((trade) => <span key={trade.id}>{trade.name}</span>)}
          {job.has_contact_number && <span>Telefono numeris originaliame įraše</span>}</div>
        <div className={styles.actions}><a href={job.source_url} target="_blank" rel="noopener noreferrer" onClick={rememberScroll}>Žiūrėti originalų įrašą ↗</a>
          <a href={`mailto:pagalba@localpro.lt?subject=${encodeURIComponent(`Pranešti apie skelbimą ${job.id}`)}`}>Pranešti apie skelbimą</a></div>
      </article>)}
      {loading && <p role="status">Įkeliami skelbimai…</p>}
      {error && <div role="alert"><p>Skelbimų įkelti nepavyko.</p><button onClick={() => void load(jobs.length ? cursor : null, jobs.length === 0)}>Bandyti dar kartą</button></div>}
      {!loading && !error && !jobs.length && <div className={styles.empty}><h2>Skelbimų nerasta</h2><p>Pabandykite pakeisti arba išvalyti filtrus.</p>
        <button onClick={() => { changeFilter("trade", ""); window.location.href = "/darbu-skelbimai"; }}>Išvalyti filtrus</button></div>}
      {!loading && !error && hasMore && <button ref={moreButton} className={styles.more} onClick={() => {
        if (initialAccess === "guest") setGated(true);
        else if (initialAccess === "registration") router.push(`/meistro-registracija?next=${encodeURIComponent(loginNext)}`);
        else void load(cursor, false);
      }} disabled={!cursor}>Rodyti daugiau</button>}
      {!loading && !error && !hasMore && jobs.length > 0 && <p className={styles.end}>Visi atitinkantys skelbimai parodyti.</p>}
    </section>
    {gated && <dialog ref={registrationDialog} className={styles.registrationDialog} aria-labelledby="jobs-registration-title" onClose={() => { setGated(false); moreButton.current?.focus(); }}>
      <button className={styles.dialogClose} type="button" aria-label="Uždaryti" onClick={() => registrationDialog.current?.close()}>×</button>
      <span className={styles.dialogIcon} aria-hidden="true">✦</span>
      <p className={styles.dialogEyebrow}>Daugiau galimybių</p>
      <h2 id="jobs-registration-title">Atraskite daugiau darbų skelbimų</h2>
      <p>Nemokamai tęskite su Google ir atraskite daugiau jums tinkamų darbų.</p>
      <a className={styles.googleButton} href={`/auth/google?next=${encodeURIComponent(loginNext)}`} onClick={rememberScroll}>Tęsti su Google nemokamai <span aria-hidden="true">↗</span></a>
      <button className={styles.notNow} type="button" onClick={() => registrationDialog.current?.close()}>Dabar ne</button>
    </dialog>}
  </main>;
}
