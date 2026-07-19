import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth-session";
import { createServerSupabase } from "../../../../lib/supabase";

export async function GET(request: Request) {
  if (!requireAdminSession(request)) return NextResponse.json({ error: "Neautorizuota" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ requests: [], mode: "seed" });

  const { data, error } = await supabase.from("enquiries").select("id,client_name,client_phone,client_email,source_city,source_service,message,service_category_slug,service_subcategory_slug,source_address,urgency,preferred_contact_method,privacy_consent_at,request_status,created_at,enquiry_photos(id,original_name,storage_path)").not("privacy_consent_at", "is", null).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const requests = data ?? [];
  await Promise.all(requests.flatMap((item) => (item.enquiry_photos ?? []).map(async (photo) => {
    const { data: signed, error: signError } = await supabase.storage.from("enquiry-photos").createSignedUrl(photo.storage_path, 600);
    Object.assign(photo, { preview_url: signError ? null : signed.signedUrl });
  })));
  return NextResponse.json({ requests, mode: "database" });
}
