import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../../lib/supabase";
import { REGISTRATION_PHOTO_MAX_BYTES, REGISTRATION_PHOTO_TYPES } from "../../../../../lib/registration-photos";
import { verifyRegistrationPhotoUploadToken } from "../../../../../lib/registration-photo-upload-token";

const PROFILE_PHOTOS_BUCKET = "profile-photos";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: string; uploadToken?: string } | null;
  const action = body?.action;
  const claims = verifyRegistrationPhotoUploadToken(String(body?.uploadToken ?? ""));
  if (!claims || !["finalize", "abort"].includes(String(action))) {
    return NextResponse.json({ error: "Nuotraukos įkėlimo leidimas netinkamas arba nebegalioja." }, { status: 401 });
  }

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Nuotraukų saugykla nepasiekiama." }, { status: 503 });

  const { data: existingRecords } = await supabase
    .from("profile_photos")
    .select("id")
    .eq("tradesperson_profile_id", claims.profileId)
    .eq("storage_path", claims.storagePath)
    .limit(1);

  if (action === "abort") {
    if (!existingRecords?.length) {
      await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([claims.storagePath]);
    }
    return NextResponse.json({ ok: true });
  }

  if (existingRecords?.length) {
    return NextResponse.json({ ok: true, moderationStatus: "pending" });
  }

  const prefix = `${claims.profileId}/`;
  if (!claims.storagePath.startsWith(prefix) || claims.storagePath.includes("..")) {
    return NextResponse.json({ error: "Netinkamas saugyklos kelias." }, { status: 400 });
  }

  const fileName = claims.storagePath.slice(prefix.length);
  const { data: objects, error: listError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).list(claims.profileId, {
    search: fileName,
    limit: 2
  });
  const uploaded = objects?.find((item) => item.name === fileName);
  const reportedSize = Number(uploaded?.metadata?.size ?? 0);
  const reportedType = String(uploaded?.metadata?.mimetype ?? "");
  const valid =
    !listError &&
    uploaded &&
    reportedSize >= 1 &&
    reportedSize <= REGISTRATION_PHOTO_MAX_BYTES &&
    reportedSize === claims.size &&
    REGISTRATION_PHOTO_TYPES.includes(reportedType as (typeof REGISTRATION_PHOTO_TYPES)[number]) &&
    reportedType === claims.type;

  if (!valid) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([claims.storagePath]);
    return NextResponse.json({ error: "Įkeltas failas neatitiko nuotraukos tipo arba dydžio reikalavimų." }, { status: 400 });
  }

  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("tradesperson_profile_id", claims.profileId)
    .is("removed_from_profile_at", null);
  if ((count ?? 0) >= 8) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([claims.storagePath]);
    return NextResponse.json({ error: "Galima turėti daugiausia 8 nuotraukas." }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("profile_photos").insert({
    tradesperson_profile_id: claims.profileId,
    storage_path: claims.storagePath,
    url: null,
    label: claims.name,
    alt_text: null,
    moderation_status: "pending",
    sort_order: count ?? 0,
    removed_from_profile_at: null
  });
  if (insertError) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([claims.storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moderationStatus: "pending" });
}
