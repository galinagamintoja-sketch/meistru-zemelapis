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
    if (!REGISTRATION_PHOTO_TYPES.includes(type) || size < 1 || size > REGISTRATION_PHOTO_MAX_BYTES) return NextResponse.json({ error: "JPG, PNG arba WebP nuotrauka gali būti iki 5 MB." }, { status: 400 });
    const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null);
    if ((count ?? 0) >= 8) return NextResponse.json({ error: "Galima turėti daugiausia 8 nuotraukas." }, { status: 400 });
    const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
    if (error || !data) return NextResponse.json({ error: "Nepavyko paruošti įkėlimo." }, { status: 500 });
    return NextResponse.json({ signedUrl: data.signedUrl, uploadToken: createRegistrationPhotoUploadToken({ profileId: profile.id, storagePath, name, type, size, expiresAt: Date.now() + 15 * 60_000 }) });
  }

  const claims = verifyRegistrationPhotoUploadToken(String(body.uploadToken ?? ""));
  if (!claims || claims.profileId !== profile.id) return NextResponse.json({ error: "Įkėlimo leidimas negalioja." }, { status: 401 });
  if (action === "abort") {
    await supabase.storage.from(bucket).remove([claims.storagePath]);
    return NextResponse.json({ ok: true });
  }
  if (action !== "finalize") return NextResponse.json({ error: "Nežinomas veiksmas." }, { status: 400 });
  const fileName = claims.storagePath.slice(`${profile.id}/`.length);
  const { data: objects } = await supabase.storage.from(bucket).list(profile.id, { search: fileName, limit: 2 });
  const uploaded = objects?.find((item) => item.name === fileName);
  const size = Number(uploaded?.metadata?.size ?? 0);
  const type = String(uploaded?.metadata?.mimetype ?? "");
  if (!uploaded || size !== claims.size || size > REGISTRATION_PHOTO_MAX_BYTES || type !== claims.type) {
    await supabase.storage.from(bucket).remove([claims.storagePath]);
    return NextResponse.json({ error: "Įkeltas failas neatitiko reikalavimų." }, { status: 400 });
  }
  const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", profile.id).is("removed_from_profile_at", null);
  const { error } = await supabase.from("profile_photos").insert({ tradesperson_profile_id: profile.id, storage_path: claims.storagePath, url: null, label: claims.name, moderation_status: "pending", sort_order: count ?? 0 });
  if (error) return NextResponse.json({ error: "Nuotraukos įrašyti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_photo_submitted", notes: "Gallery photo submitted for moderation", created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true, moderationStatus: "pending" });
}
