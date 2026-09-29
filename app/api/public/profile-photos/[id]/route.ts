import { createServerSupabase } from "../../../../../lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const db = createServerSupabase();
  if (!db) return new Response(null, { status: 404 });
  const { data: photo, error } = await db.from("profile_photos")
    .select("storage_path,card_storage_path,moderation_status,removed_from_profile_at,tradesperson_profiles!inner(public_status,approval_status,is_demo,public_contact_consent_at)")
    .eq("id", id).maybeSingle();
  if (error || !photo) return new Response(null, { status: 404 });
  const profile = Array.isArray(photo.tradesperson_profiles) ? photo.tradesperson_profiles[0] : photo.tradesperson_profiles;
  if (photo.moderation_status !== "approved" || photo.removed_from_profile_at ||
    profile?.public_status !== "public" || profile?.approval_status !== "approved" ||
    profile?.is_demo || !profile?.public_contact_consent_at) return new Response(null, { status: 404 });
  const variant = new URL(request.url).searchParams.get("variant");
  if (variant && variant !== "card") return new Response(null, { status: 404 });
  const storagePath = variant === "card" ? photo.card_storage_path : photo.storage_path;
  if (!storagePath) return new Response(null, { status: 404 });
  const { data, error: downloadError } = await db.storage.from("profile-photos").download(storagePath);
  if (downloadError || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
