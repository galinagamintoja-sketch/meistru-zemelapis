export default function PublicPageLoading({ archive = false }: { archive?: boolean }) {
  return <main aria-busy="true" style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 24px", minHeight: "100vh" }}>
    <a href="/" style={{ color: "#0e5444", fontWeight: 800 }}>LocalPro.lt</a>
    <h1 style={{ marginTop: 56 }}>{archive ? "Darbų skelbimai" : "Raskite meistrą savo mieste"}</h1>
    <p role="status">{archive ? "Įkeliami darbų skelbimai ir filtrai…" : "Įkeliami specialistai ir paslaugos…"}</p>
    <div aria-hidden="true" style={{ display: "grid", gap: 16, marginTop: 32 }}>
      {[1, 2, 3].map((key) => <div key={key} style={{ height: 116, borderRadius: 16, background: "#edf2ef" }} />)}
    </div>
  </main>;
}
