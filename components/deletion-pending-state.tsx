import Link from "next/link";
import { PortalCard } from "./tradesperson-shell";

export function DeletionPendingState() {
  return <div className="portal-page"><PortalCard title="Paskyros ištrynimas suplanuotas"><p>Kol ištrynimas neatšauktas, šios paskyros duomenų keisti negalima.</p><Link className="portal-primary" href="/meistras/paskyra">Atidaryti paskyrą</Link></PortalCard></div>;
}
