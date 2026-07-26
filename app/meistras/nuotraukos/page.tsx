import { PortalCard } from "../../../components/tradesperson-shell";
import { PhotoUploader } from "../../../components/photo-uploader";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { createServerSupabase } from "../../../lib/supabase";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
export default async function Page() {
  const { profile } = await requireOwnedProfile(); if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: rows } = supabase ? await supabase.from("profile_photos").select("id,label,url,storage_path,moderation_status").eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null).order("sort_order") : { data: [] };
  const photos = await Promise.all((rows ?? []).map(async (photo) => {
    if (photo.url) return { id: photo.id, name: photo.label ?? "Darbų nuotrauka", url: photo.url, status: photo.moderation_status };
    const { data } = photo.storage_path && supabase ? await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 600) : { data: null };
    return { id: photo.id, name: photo.label ?? "Darbų nuotrauka", url: data?.signedUrl ?? null, status: photo.moderation_status };
  }));
  return <div className="portal-page"><div className="portal-heading"><h1>Nuotraukos</h1><p>Naujos ir pakeistos nuotraukos viešinamos tik administratoriui patvirtinus. Dabartinės patvirtintos nuotraukos lieka matomos.</p></div><PortalCard title="Darbų nuotraukos"><PhotoUploader photos={photos} /></PortalCard></div>;
}
