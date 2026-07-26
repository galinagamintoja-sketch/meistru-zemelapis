import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { REGISTRATION_PHOTO_MAX_BYTES, REGISTRATION_PHOTO_TYPES } from "../../../../lib/registration-photos";
import { createRegistrationPhotoUploadToken, verifyRegistrationPhotoUploadToken } from "../../../../lib/registration-photo-upload-token";

const bucket = "profile-photos";

export async function POST(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Saugykla nepasiekiama." }, { status: 503 });

  if (action === "create") {
    const type = String(body.type ?? "") as (typeof REGISTRATION_PHOTO_TYPES)[number];
    const size = Number(body.size);
    const name = String(body.name ?? "Nuotrauka").slice(0, 160);
    const replacePhotoId = String(body.replacePhotoId ?? "");
    if (!REGISTRATION_PHOTO_TYPES.includes(type) || size < 1 || size > REGISTRATION_PHOTO_MAX_BYTES) return NextResponse.json({ error: "JPG, PNG arba WebP nuotrauka gali būti iki 5 MB." }, { status: 400 });
    if (replacePhotoId && !(await ownedApprovedPhoto(supabase, profile.id, replacePhotoId))) return NextResponse.json({ error: "Keičiama nuotrauka nerasta." }, { status: 404 });
    const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null).is("replaces_photo_id", null);
    if ((count ?? 0) >= 8 && !replacePhotoId) return NextResponse.json({ error: "Galima turėti daugiausia 8 nuotraukas." }, { status: 400 });
    const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
    if (error || !data) return NextResponse.json({ error: "Nepavyko paruošti įkėlimo." }, { status: 500 });
    return NextResponse.json({ storagePath, signedUrl: data.signedUrl, uploadToken: createRegistrationPhotoUploadToken({ profileId: profile.id, storagePath, name, type, size, expiresAt: Date.now() + 15 * 60_000 }) });
  }

  const claims = verifyRegistrationPhotoUploadToken(String(body.uploadToken ?? ""));
  if (!claims || claims.profileId !== profile.id) return NextResponse.json({ error: "Įkėlimo leidimas negalioja." }, { status: 401 });
  if (action === "abort") { await supabase.storage.from(bucket).remove([claims.storagePath]); return NextResponse.json({ ok: true }); }
  if (action !== "finalize") return NextResponse.json({ error: "Nežinomas veiksmas." }, { status: 400 });
  const fileName = claims.storagePath.slice(`${profile.id}/`.length);
  const { data: objects } = await supabase.storage.from(bucket).list(profile.id, { search: fileName, limit: 2 });
  const uploaded = objects?.find((item) => item.name === fileName);
  if (!uploaded || Number(uploaded.metadata?.size ?? 0) !== claims.size || String(uploaded.metadata?.mimetype ?? "") !== claims.type) {
    await supabase.storage.from(bucket).remove([claims.storagePath]); return NextResponse.json({ error: "Įkeltas failas neatitiko reikalavimų." }, { status: 400 });
  }
  const replacePhotoId = String(body.replacePhotoId ?? "") || null;
  if (replacePhotoId && !(await ownedApprovedPhoto(supabase, profile.id, replacePhotoId))) { await supabase.storage.from(bucket).remove([claims.storagePath]); return NextResponse.json({ error: "Keičiama nuotrauka nerasta." }, { status: 404 }); }
  const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null);
  const { error } = await supabase.from("profile_photos").insert({ tradesperson_profile_id: profile.id, storage_path: claims.storagePath, url: null, label: claims.name, moderation_status: "pending", sort_order: count ?? 0, replaces_photo_id: replacePhotoId });
  if (error) { await supabase.storage.from(bucket).remove([claims.storagePath]); return NextResponse.json({ error: "Nuotraukos įrašyti nepavyko." }, { status: 500 }); }
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_photo_submitted", notes: replacePhotoId ? `Replacement for ${replacePhotoId}` : "Gallery photo submitted", created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true, moderationStatus: "pending" });
}

export async function PATCH(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? ""), photoId = String(body.photoId ?? "");
  const supabase = createServerSupabase();
  if (!supabase || !photoId) return NextResponse.json({ error: "Nuotrauka nerasta." }, { status: 400 });
  const { data: photo } = await supabase.from("profile_photos").select("id,moderation_status,storage_path").eq("id", photoId).eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null).maybeSingle();
  if (!photo) return NextResponse.json({ error: "Nuotrauka nerasta." }, { status: 404 });
  if (action === "primary") {
    if (photo.moderation_status !== "approved") return NextResponse.json({ error: "Pagrindinė gali būti tik patvirtinta nuotrauka." }, { status: 400 });
    await supabase.from("profile_photos").update({ is_primary: false }).eq("tradesperson_profile_id", profile.id);
    const { error } = await supabase.from("profile_photos").update({ is_primary: true }).eq("id", photoId).eq("tradesperson_profile_id", profile.id);
    if (error) return NextResponse.json({ error: "Išsaugoti nepavyko." }, { status: 500 });
  } else if (action === "remove") {
    if (photo.moderation_status === "approved") return NextResponse.json({ error: "Patvirtintą nuotrauką keiskite pakeitimo veiksmu." }, { status: 400 });
    await supabase.from("profile_photos").update({ removed_from_profile_at: new Date().toISOString(), is_primary: false }).eq("id", photoId).eq("tradesperson_profile_id", profile.id);
    if (photo.storage_path) await supabase.storage.from(bucket).remove([photo.storage_path]);
  } else return NextResponse.json({ error: "Nežinomas veiksmas." }, { status: 400 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: `tradesperson_photo_${action}`, notes: photoId, created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true });
}

async function ownedApprovedPhoto(supabase: NonNullable<ReturnType<typeof createServerSupabase>>, profileId: string, photoId: string) {
  const { data } = await supabase.from("profile_photos").select("id").eq("id", photoId).eq("tradesperson_profile_id", profileId).eq("moderation_status", "approved").is("removed_from_profile_at", null).maybeSingle();
  return Boolean(data);
}
