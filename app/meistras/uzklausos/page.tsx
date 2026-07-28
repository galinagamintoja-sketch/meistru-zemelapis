import { RequestInbox } from "../../../components/request-inbox";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { createServerSupabase } from "../../../lib/supabase";
import Link from "next/link";
import { PARTIAL_REGISTRATION_PHOTO_NOTICE } from "../../../lib/registration-photos";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ registracija?: string; nepavyko?: string }> }) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: services } = supabase ? await supabase
    .from("profile_services")
    .select("service_subcategories(name)")
    .eq("tradesperson_profile_id", profile.id) : { data: [] };
  const serviceNames = (services ?? []).flatMap((row) => {
    const value = row.service_subcategories as unknown as { name?: string } | Array<{ name?: string }> | null;
    const category = Array.isArray(value) ? value[0] : value;
    return category?.name ? [category.name] : [];
  });
  const completionFields = [
    Boolean(profile.description?.length >= 40),
    Boolean(profile.service_category_id),
    Boolean(profile.public_contact_consent_at),
    typeof profile.experience_years === "number",
    serviceNames.length > 0
  ];
  const completion = Math.round(completionFields.filter(Boolean).length / completionFields.length * 100);
  const query = await searchParams;
  const failedPhotos = query.nepavyko?.split(",").map((name) => name.trim()).filter(Boolean) ?? [];
  return <div className="portal-page">
    {query.registracija === "nuotrauku-klaida" ? <div className="portal-card registration-photo-notice" role="status">
      <strong>{PARTIAL_REGISTRATION_PHOTO_NOTICE}</strong>
      {failedPhotos.length ? <p>Nepavyko įkelti: {failedPhotos.join(", ")}.</p> : null}
      <Link className="portal-primary" href="/meistras/nuotraukos">Atidaryti Nuotraukas ir bandyti dar kartą</Link>
    </div> : null}
    <div className="portal-heading request-page-heading"><div><h1>Užklausos</h1><p>{profile.base_city} · {profile.radius_km} km spindulys</p></div><a className="portal-secondary" href={`/specialist/${profile.id}`} target="_blank">Peržiūrėti viešą profilį</a></div>
    <RequestInbox completion={completion} services={serviceNames} />
  </div>;
}
