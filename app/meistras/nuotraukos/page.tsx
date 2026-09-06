import { PortalCard } from "../../../components/tradesperson-shell";
import { PhotoUploader } from "../../../components/photo-uploader";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { createServerSupabase } from "../../../lib/supabase";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { getActiveAccountDeletion } from "../../../lib/account-deletion";
import { DeletionPendingState } from "../../../components/deletion-pending-state";

export default async function Page() {
  const { user, profile } = await requireOwnedProfile();
  if (await getActiveAccountDeletion(user.id)) return <DeletionPendingState />;
  if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: rows } = supabase ? await supabase.from("profile_photos").select("id,label,url,storage_path,moderation_status,rejection_reason,is_primary").eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null).order("sort_order") : { data: [] };
  const photos = await Promise.all((rows ?? []).map(async (photo) => {
    const signed = !photo.url && photo.storage_path && supabase ? (await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 600)).data?.signedUrl ?? null : null;
    return { id: photo.id, name: photo.label ?? "Darbų nuotrauka", url: photo.url ?? signed, status: photo.moderation_status, rejectionReason: photo.rejection_reason, isPrimary: photo.is_primary };
  }));
  return <div className="portal-page"><div className="portal-heading"><h1>Nuotraukos</h1><p>Naujos ir pakeistos nuotraukos paskelbiamos iškart. Netinkamą turinį administratorius gali pašalinti po paskelbimo.</p></div><PortalCard title="Darbų nuotraukos"><PhotoUploader photos={photos} /></PortalCard></div>;
}
