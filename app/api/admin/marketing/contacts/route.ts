import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth-session";
import { createServerSupabase } from "../../../../../lib/supabase";

export async function GET(request: Request) {
  if (!await requireAdminSession(request)) return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ mode: "seed", contacts: [] });
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const status = searchParams.get("status");
  let query = supabase.from("marketing_contacts").select(`
    id,display_name,company_name,trade,area,status,recipient_category,notes,specialist_profile_id,registered_at,created_at,updated_at,
    marketing_contact_identities(id,identity_type,raw_value,normalized_value,is_primary,is_valid),
    marketing_contact_sources(id,source_type,source_url,group_url,post_url,source_label,discovered_at)
  `, { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "database", contacts: data ?? [], pagination: { page, limit, total: count ?? 0 } });
}

