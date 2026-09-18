/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";
import LocalProBrand from "../../../components/LocalProBrand";
import styles from "./marketing.module.css";

type Section = "dashboard" | "contacts" | "queue" | "inbox" | "drafts" | "settings";
type Contact = {
  id: string; display_name: string; company_name?: string | null; trade?: string | null; area?: string | null; status: string; created_at: string;
  marketing_contact_identities?: Array<{ identity_type: string; raw_value: string; normalized_value: string; is_valid: boolean }>;
  marketing_contact_sources?: Array<{ source_url?: string | null; post_url?: string | null; source_label?: string | null }>;
};
type ImportPreview = { fileName: string; headers: string[]; mapping: Record<string, string>; summary: Record<string, number>; rows: Array<{ rowNumber: number; outcome: string; reasons: string[]; values: Record<string, string | null> }> };

const sections: Array<{ id: Section; label: string }> = [
  { id: "dashboard", label: "Apžvalga" }, { id: "contacts", label: "Kontaktai" }, { id: "queue", label: "Siuntimo eilė" },
  { id: "inbox", label: "Žinutės" }, { id: "drafts", label: "Juodraščiai" }, { id: "settings", label: "Nustatymai" }
];
const statusLabels: Record<string, string> = {
  new: "Naujas", contacted: "Susisiekta", replied: "Atsakė", interested: "Domisi", registered: "Užsiregistravo",
  not_interested: "Nesidomi", do_not_contact: "Nekontaktuoti", invalid_contact: "Netinkamas kontaktas"
};

export default function MarketingAdminPage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [overview, setOverview] = useState<any>({ counts: {}, queue: [], conversations: [], drafts: [], settings: {} });
  const [message, setMessage] = useState("Tikrinama administratoriaus prieiga...");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const loadData = useCallback(async () => {
    const [contactsResponse, overviewResponse] = await Promise.all([
      fetch("/api/admin/marketing/contacts?limit=100"), fetch("/api/admin/marketing/overview")
    ]);
    if (contactsResponse.status === 401 || overviewResponse.status === 401) {
      setAuthorized(false); setChecked(true); setMessage("Prisijunkite su administratoriaus Google paskyra."); return;
    }
    const contactsData = await contactsResponse.json();
    const overviewData = await overviewResponse.json();
    if (!contactsResponse.ok || !overviewResponse.ok) throw new Error(contactsData.error ?? overviewData.error ?? "Duomenų įkelti nepavyko");
    setAuthorized(true); setChecked(true); setContacts(contactsData.contacts ?? []); setOverview(overviewData); setMessage(overviewData.mode === "seed" ? "Duomenų bazė neprijungta – rodoma tuščia saugi peržiūra." : "");
  }, []);

  useEffect(() => { loadData().catch((error) => { setChecked(true); setMessage(error instanceof Error ? error.message : "Duomenų įkelti nepavyko"); }); }, [loadData]);

  const upload = async (commit: boolean) => {
    if (!file) return;
    setBusy(true); setMessage(commit ? "Importuojami patvirtinti įrašai..." : "Ruošiama importo peržiūra...");
    try {
      const form = new FormData(); form.set("file", file); form.set("commit", String(commit));
      if (Object.keys(mapping).length) form.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/admin/marketing/import/contacts", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Importas nepavyko");
      if (!commit) { setPreview(data); setMapping(data.mapping ?? {}); setMessage("Peržiūrėkite rezultatus ir stulpelių susiejimą."); }
      else { setPreview(null); setFile(null); setMapping({}); setMessage(`Importas baigtas. Apdorota: ${data.results?.length ?? 0}.`); await loadData(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Importas nepavyko"); }
    finally { setBusy(false); }
  };

  const draftAction = async (draft: any, action: "edit" | "approve" | "reject") => {
    const nextBody = action === "edit" ? window.prompt("Redaguokite žinutę", draft.body) : null;
    if (action === "edit" && nextBody === null) return;
    setBusy(true); setMessage("Atnaujinamas juodraštis...");
    try {
      const response = await fetch("/api/admin/marketing/drafts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: draft.id, action, body: nextBody }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Veiksmas nepavyko");
      setMessage(action === "approve" ? "Juodraščio versija patvirtinta ir įtraukta į saugią eilę." : "Juodraštis atnaujintas."); await loadData();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Veiksmas nepavyko"); }
    finally { setBusy(false); }
  };

  if (!checked || !authorized) return <main className={styles.login}><LocalProBrand /><p className="eyebrow">LocalPro marketingas</p><h1>Marketingo CRM</h1><p>{message}</p>{checked ? <a className={styles.primary} href="/auth/google?next=%2Fadmin%2Fmarketing">Prisijungti su Google</a> : null}</main>;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div><a href="/" aria-label="LocalPro pradžia"><LocalProBrand /></a><p className="eyebrow">ADMIN / MARKETINGAS</p><h1>Ryšių su meistrais centras</h1><p>Kontaktai, patvirtinimai ir pokalbiai vienoje saugioje vietoje.</p></div>
      <div className={styles.headerActions}><a href="/admin">Profilių administravimas</a><button type="button" onClick={() => loadData()}>Atnaujinti</button></div>
    </header>
    <nav className={styles.nav} aria-label="Marketingo skyriai">{sections.map((item) => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {section === "dashboard" ? <Dashboard counts={overview.counts} queue={overview.queue} conversations={overview.conversations} /> : null}
    {section === "contacts" ? <Contacts contacts={contacts} selected={selectedContact} onSelect={setSelectedContact} file={file} setFile={setFile} busy={busy} preview={preview} mapping={mapping} setMapping={setMapping} upload={upload} /> : null}
    {section === "queue" ? <Queue items={overview.queue} /> : null}
    {section === "inbox" ? <Inbox conversations={overview.conversations} /> : null}
    {section === "drafts" ? <Drafts drafts={overview.drafts} busy={busy} onAction={draftAction} /> : null}
    {section === "settings" ? <Settings settings={overview.settings} /> : null}
  </main>;
}

function Dashboard({ counts, queue, conversations }: any) {
  const needsReply = conversations.filter((item: any) => item.needs_reply).length;
  return <><section className={styles.metrics} aria-label="CRM rodikliai">
    <Metric label="Nauji kontaktai" value={counts.new ?? 0} detail="Laukia tinkamumo patikros" />
    <Metric label="Laukia atsakymo" value={queue.filter((item: any) => item.status === "queued").length} detail="Suplanuota, dar neišsiųsta" />
    <Metric label="Reikia atsakyti" value={needsReply} detail="Pokalbiai sustabdė sekas" />
    <Metric label="Užsiregistravo" value={counts.registered ?? 0} detail="Tolesnis pritraukimas sustabdytas" />
  </section><section className={styles.grid}><article className={styles.panel}><p className="eyebrow">ŠIANDIEN</p><h2>Darbo eiga</h2><ol className={styles.workflow}><li><strong>Patikrinkite naujus kontaktus</strong><span>Nežinomos teisės siųsti lieka sulaikytos.</span></li><li><strong>Peržiūrėkite juodraščius</strong><span>Patvirtinimas galioja tik konkrečiai versijai.</span></li><li><strong>Stebėkite atsakymus</strong><span>Bet koks atsakymas nedelsiant pristabdo seką.</span></li></ol></article><article className={styles.panel}><p className="eyebrow">SAUGOS BŪSENA</p><h2>Siuntimas pristabdytas</h2><p>Pradinis nustatymas neleidžia automatiškai siųsti žinučių. Kanalų adapteriai dar neprijungti.</p><span className={`${styles.badge} ${styles.safe}`}>Globalus pristabdymas įjungtas</span></article></section></>;
}
function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }

function Contacts({ contacts, selected, onSelect, file, setFile, busy, preview, mapping, setMapping, upload }: any) {
  const fields = ["name","company","trade","area","phone","email","sourceUrl","groupUrl","postUrl","sourceDate"];
  return <section className={styles.stack}><article className={styles.panel}><div className={styles.panelHeading}><div><p className="eyebrow">EXCEL / CSV</p><h2>Importuoti kontaktus</h2><p>Pirmiausia kuriama peržiūra. Konfliktai niekada nesujungiami automatiškai.</p></div><label className={styles.fileButton}>Pasirinkti failą<input type="file" accept=".xlsx,.csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); }} /></label></div>{file ? <div className={styles.importBar}><span>{file.name}</span><button className={styles.primary} type="button" disabled={busy} onClick={() => upload(false)}>{busy ? "Tikrinama..." : "Rodyti peržiūrą"}</button></div> : null}
    {preview ? <div className={styles.preview}><h3>Stulpelių susiejimas</h3><div className={styles.mapping}>{fields.map((field) => <label key={field}>{field}<select value={mapping[field] ?? ""} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">Nenaudoti</option>{preview.headers.map((header: string) => <option key={header}>{header}</option>)}</select></label>)}</div><div className={styles.summary}>{Object.entries(preview.summary).map(([key,value]) => <span key={key}><strong>{String(value)}</strong> {key}</span>)}</div><div className={styles.tableWrap}><table><thead><tr><th>Eilutė</th><th>Rezultatas</th><th>Vardas</th><th>Telefonas</th><th>El. paštas</th><th>Pastaba</th></tr></thead><tbody>{preview.rows.slice(0,100).map((row: any) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><span className={styles.badge}>{row.outcome}</span></td><td>{row.values.name}</td><td>{row.values.phoneNormalized ?? row.values.phoneRaw}</td><td>{row.values.emailNormalized ?? row.values.emailRaw}</td><td>{row.reasons.join(", ") || "—"}</td></tr>)}</tbody></table></div><button className={styles.primary} type="button" disabled={busy || (preview.summary.conflict ?? 0) + (preview.summary.invalid ?? 0) === preview.rows.length} onClick={() => upload(true)}>Importuoti priimtinas eilutes</button></div> : null}</article>
    <article className={styles.panel}><div className={styles.panelHeading}><div><p className="eyebrow">KONTAKTAI</p><h2>{contacts.length} įrašai</h2></div></div><div className={styles.contactLayout}><div className={styles.contactList}>{contacts.length ? contacts.map((contact: Contact) => <button key={contact.id} type="button" onClick={() => onSelect(contact)} aria-pressed={selected?.id === contact.id}><span><strong>{contact.display_name}</strong><small>{contact.trade || "Specialybė nenurodyta"} · {contact.area || "Vieta nenurodyta"}</small></span><span className={styles.badge}>{statusLabels[contact.status] ?? contact.status}</span></button>) : <Empty text="Kontaktų dar nėra. Importuokite pirmą XLSX arba CSV failą." />}</div>{selected ? <aside className={styles.detail}><button type="button" className={styles.close} onClick={() => onSelect(null)} aria-label="Uždaryti kontaktą">×</button><p className="eyebrow">KONTAKTO INFORMACIJA</p><h2>{selected.display_name}</h2><span className={styles.badge}>{statusLabels[selected.status] ?? selected.status}</span><dl>{selected.marketing_contact_identities?.map((identity: any) => <div key={identity.normalized_value}><dt>{identity.identity_type}</dt><dd>{identity.raw_value}</dd></div>)}<div><dt>Specialybė</dt><dd>{selected.trade || "—"}</dd></div><div><dt>Vieta</dt><dd>{selected.area || "—"}</dd></div><div><dt>Pridėta</dt><dd>{new Date(selected.created_at).toLocaleDateString("lt-LT")}</dd></div></dl><h3>Šaltiniai</h3>{selected.marketing_contact_sources?.length ? selected.marketing_contact_sources.map((source: any, index: number) => <a key={index} href={source.post_url || source.source_url || undefined} target="_blank" rel="noreferrer">{source.source_label || source.post_url || source.source_url}</a>) : <p>Šaltinių nėra.</p>}</aside> : null}</div></article></section>;
}

function Queue({ items }: any) { return <article className={styles.panel}><p className="eyebrow">SIUNTIMO EILĖ</p><h2>Patvirtinti ir suplanuoti veiksmai</h2><p>Kanalų adapteriai dar neprijungti. Eilė saugoma duomenų bazėje ir prieš siuntimą turės iš naujo patikrinti visas saugos sąlygas.</p>{items.length ? <div className={styles.cards}>{items.map((item: any) => <div className={styles.rowCard} key={item.id}><span className={styles.badge}>{item.status}</span><strong>{item.marketing_drafts?.marketing_contacts?.display_name}</strong><p>{item.marketing_drafts?.body}</p><small>{new Date(item.due_at).toLocaleString("lt-LT")}</small></div>)}</div> : <Empty text="Eilė tuščia." />}</article>; }
function Inbox({ conversations }: any) { return <article className={styles.panel}><p className="eyebrow">BENDRAS INBOX</p><h2>Telegram, el. paštas ir SMS vienoje laiko juostoje</h2>{conversations.length ? <div className={styles.cards}>{conversations.map((conversation: any) => <div className={styles.rowCard} key={conversation.id}><div className={styles.panelHeading}><strong>{conversation.marketing_contacts?.display_name ?? "Reikia susieti kontaktą"}</strong>{conversation.needs_reply ? <span className={`${styles.badge} ${styles.warning}`}>Reikia atsakyti</span> : null}</div>{conversation.marketing_messages?.slice(-3).map((message: any) => <p key={message.id}><small>{message.channel} · {message.direction}</small><br />{message.body}</p>)}</div>)}</div> : <Empty text="Pokalbių dar nėra. Neatpažinti siuntėjai vėliau bus rodomi čia kaip „Reikia susieti“." />}</article>; }
function Drafts({ drafts, busy, onAction }: any) { return <article className={styles.panel}><p className="eyebrow">JUODRAŠČIAI IR PATVIRTINIMAI</p><h2>Žinučių versijos</h2><p>Pakeitus gavėją, kanalą arba tekstą, ankstesnis patvirtinimas nebegalioja.</p>{drafts.length ? <div className={styles.cards}>{drafts.map((draft: any) => <div className={styles.rowCard} key={draft.id}><div className={styles.panelHeading}><strong>{draft.marketing_contacts?.display_name}</strong><span className={styles.badge}>{draft.status} · v{draft.revision}</span></div><small>{draft.channel} · {draft.draft_type}</small><p>{draft.body}</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => onAction(draft,"edit")}>Redaguoti</button><button type="button" disabled={busy || draft.status !== "draft"} onClick={() => onAction(draft,"approve")}>Patvirtinti</button><button type="button" disabled={busy || draft.status === "rejected"} onClick={() => onAction(draft,"reject")}>Atmesti</button></div></div>)}</div> : <Empty text="Juodraščių nėra." />}</article>; }
function Settings({ settings }: any) { const rules = settings.outreach_rules ?? {}; return <div className={styles.grid}><article className={styles.panel}><p className="eyebrow">INTEGRACIJOS</p><h2>Kanalai</h2>{["Telegram","El. paštas","SMS"].map((label) => <div className={styles.settingRow} key={label}><span>{label}</span><span className={styles.badge}>Neprijungta</span></div>)}</article><article className={styles.panel}><p className="eyebrow">OUTREACH TAISYKLĖS</p><h2>Piloto ribos</h2><dl className={styles.settingsList}><div><dt>Nauji kontaktai per dieną</dt><dd>{rules.newContactsPerDay ?? 5}</dd></div><div><dt>Visos iniciatyvios žinutės</dt><dd>{rules.proactiveMessagesPerDay ?? 20}</dd></div><div><dt>Tarpas tarp žingsnių</dt><dd>{rules.delayDays ?? 4} d.</dd></div><div><dt>Siuntimo langas</dt><dd>{rules.windowStart ?? "09:00"}–{rules.windowEnd ?? "18:00"}</dd></div><div><dt>Maksimalūs bandymai</dt><dd>{rules.maximumAttempts ?? 3}</dd></div><div><dt>Globalus pristabdymas</dt><dd>{rules.globalPause === false ? "Išjungtas" : "Įjungtas"}</dd></div></dl></article><article className={styles.panel}><p className="eyebrow">IMPORTO TAISYKLĖS</p><h2>Duomenų apsauga</h2><ul className={styles.checks}><li>Telefonas ir el. paštas tikrinami atskirai</li><li>Rankiniai pataisymai neperrašomi tuščiais laukais</li><li>Slopinimas ir registracija išlieka po pakartotinio importo</li><li>Konfliktai sulaikomi peržiūrai</li></ul></article></div>; }
function Empty({ text }: { text: string }) { return <div className={styles.empty}><strong>Kol kas tuščia</strong><p>{text}</p></div>; }
