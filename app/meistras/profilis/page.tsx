import { PortalCard } from "../../../components/tradesperson-shell";
import { ProfileForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { createServerSupabase } from "../../../lib/supabase";
import Link from "next/link";
export default async function Page() {
  const { profile } = await requireOwnedProfile();
  if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: categories } = supabase ? await supabase.from("service_categories").select("id,name").eq("is_active", true).order("sort_order") : { data: [] };
  const checks = [
    ["Aprašymas", Boolean(profile.description?.length >= 40)],
    ["Specialybė", Boolean(profile.service_category_id)],
    ["Vieši kontaktai", Boolean(profile.public_contact_consent_at)],
    ["Patirtis", typeof profile.experience_years === "number"]
  ] as const;
  const status = profile.approval_status === "approved" && profile.public_status === "public" ? "Profilis aktyvus" : profile.approval_status === "pending" ? "Laukia patvirtinimo" : profile.approval_status === "suspended" ? "Profilis sustabdytas" : "Reikia pataisyti";
  return <div className="portal-page"><div className="portal-heading"><h1>Mano profilis</h1><p>Tvarkykite viešą profilį ir kontaktinius duomenis. Prisijungimo el. paštas keičiamas tik skiltyje „Paskyra“.</p></div>
    <section className="profile-status-banner"><div><span className={`status-badge ${status === "Profilis aktyvus" ? "status-success" : "status-warning"}`}>{status}</span><div className="profile-checklist">{checks.map(([label, complete]) => <span key={label}>{complete ? "✓" : "○"} {label}</span>)}</div></div><Link className="portal-secondary" href={`/specialist/${profile.id}`} target="_blank">Peržiūrėti viešą profilį</Link></section>
    <PortalCard title="Profilio informacija"><ProfileForm categories={categories ?? []} initial={{ displayName: profile.display_name, companyName: profile.company_name ?? "", primaryCategoryId: profile.service_category_id ?? "", experienceYears: profile.experience_years ?? 0, phone: profile.phone, whatsappNumber: profile.whatsapp_number ?? "", publicEmail: profile.email, description: profile.description ?? "", languages: profile.languages ?? [], publicContactConsent: Boolean(profile.public_contact_consent_at) }} /></PortalCard></div>;
}
