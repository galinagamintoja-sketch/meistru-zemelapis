import { PortalCard } from "../../../components/tradesperson-shell";
import { ProfileForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { ProfileVisibilityControl } from "../../../components/profile-visibility-control";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { createServerSupabase } from "../../../lib/supabase";
import Link from "next/link";
import { getActiveAccountDeletion } from "../../../lib/account-deletion";
import { DeletionPendingState } from "../../../components/deletion-pending-state";
import { resolveEditorCategoryId } from "../../../lib/profile-editor-category";
export default async function Page() {
  const { user, profile } = await requireOwnedProfile();
  if (await getActiveAccountDeletion(user.id)) return <DeletionPendingState />;
  if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const [{ data: categories }, { data: assignedCategories }, { data: savedServices }] = supabase ? await Promise.all([
    supabase.from("service_categories").select("id,name").eq("is_active", true).order("sort_order"),
    supabase.from("profile_category_assignments").select("service_category_id").eq("tradesperson_profile_id", profile.id),
    supabase.from("profile_services").select("service_category_id").eq("tradesperson_profile_id", profile.id)
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const primaryCategoryId = resolveEditorCategoryId({
    activeCategoryIds: (categories ?? []).map((category) => category.id),
    assignedCategoryIds: (assignedCategories ?? []).map((item) => item.service_category_id).filter(Boolean),
    serviceCategoryIds: (savedServices ?? []).map((item) => item.service_category_id).filter(Boolean),
    legacyCategoryId: profile.service_category_id
  });
  const checks = [
    ["Aprašymas", Boolean(profile.description?.length >= 40)],
    ["Specialybė", Boolean(profile.service_category_id)],
    ["Vieši kontaktai", Boolean(profile.public_contact_consent_at)],
    ["Patirtis", typeof profile.experience_years === "number"]
  ] as const;
  const completion = Math.round((checks.filter(([, complete]) => complete).length / checks.length) * 100);
  const isPublic = profile.approval_status === "approved" && profile.public_status === "public";
  const isTemporarilyHidden = profile.approval_status === "approved" && profile.public_status === "private";
  const status = isPublic ? "Profilis aktyvus" : isTemporarilyHidden ? "Profilis paslėptas" : profile.approval_status === "pending" ? "Laukia patvirtinimo" : profile.approval_status === "suspended" ? "Profilis sustabdytas" : "Reikia pataisyti";
  const statusText = isPublic
    ? "Jūsų profilis matomas meistrų žemėlapyje."
    : isTemporarilyHidden
      ? "Jūsų profilis laikinai nerodomas žemėlapyje ir paieškoje."
      : "Užbaikite trūkstamus profilio punktus.";
  return <div className="portal-page"><div className="portal-heading profile-edit-heading"><div><h1>Mano profilis</h1><p>Tvarkykite viešą profilį ir kontaktinius duomenis. Prisijungimo el. paštas keičiamas tik skiltyje „Paskyra“.</p></div>{isPublic ? <Link className="profile-public-link" href={`/specialist/${profile.id}`} target="_blank">Atidaryti viešą profilį</Link> : null}</div>
    <section className="profile-status-banner">
      <div className="profile-status-copy"><span className={`status-badge ${isPublic ? "status-success" : "status-warning"}`}>{status}</span><p>{statusText}</p>{profile.approval_status === "approved" ? <ProfileVisibilityControl visible={isPublic} /> : null}</div>
      <div className="profile-completion"><div><strong>Profilio užpildymas</strong><span>{completion}%</span></div><progress max="100" value={completion}>{completion}%</progress></div>
    </section>
    <PortalCard title="Profilio informacija"><ProfileForm categories={categories ?? []} initial={{ displayName: profile.display_name, companyName: profile.company_name ?? "", primaryCategoryId, experienceYears: profile.experience_years ?? 0, phone: profile.phone, whatsappNumber: profile.whatsapp_number ?? "", publicEmail: profile.email, description: profile.description ?? "", languages: profile.languages ?? [], publicContactConsent: Boolean(profile.public_contact_consent_at) }} /></PortalCard></div>;
}
