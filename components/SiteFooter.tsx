import Link from "next/link";

export default function SiteFooter() {
  return <footer className="site-footer" aria-label="Pagalbinė navigacija">
    <Link href="/">Grįžti į LocalPro</Link>
    <Link href="/privacy">Privatumas</Link>
    <Link href="/terms">Naudojimosi sąlygos</Link>
    <a href="mailto:pagalba@localpro.lt">Pagalba</a>
  </footer>;
}
