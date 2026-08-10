import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth-session";
import { createServerSupabase } from "../../../../lib/supabase";

export async function GET(request: Request) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ photos: [] });
  const { data, error } = await supabase.from("profile_photos")
    .select("id,label,storage_path,moderation_status,removed_from_profile_at,created_at,tradesperson_profiles(id,display_name,company_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Nuotraukų įkelti nepavyko." }, { status: 500 });
  const photos = await Promise.all((data ?? []).map(async (photo) => {
    let previewUrl: string | null = null;
    if (photo.storage_path) {
      const signed = await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 600);
      previewUrl = signed.error ? null : signed.data.signedUrl;
    }
    return { ...photo, preview_url: previewUrl };
  }));
  return NextResponse.json({ photos });
}
