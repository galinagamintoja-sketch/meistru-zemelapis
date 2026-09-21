import { NextResponse } from "next/server";
import { requireMarketingAdminSession } from "../../../../../lib/marketing/auth";
import { createMarketingServerSupabase } from "../../../../../lib/marketing/supabase";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  if (!(await requireMarketingAdminSession()))
    return NextResponse.json(
      { error: "CRM admin login required" },
      { status: 401 },
    );
  const supabase = createMarketingServerSupabase();
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid contacts query", code: "INVALID_CONTACTS_QUERY" },
      { status: 400 },
    );
  const { page, limit, status } = parsed.data;
  let query = supabase
    .from("marketing_contacts")
    .select(
      `
    id,display_name,company_name,trade,area,status,recipient_category,notes,registration_source_project_ref,registration_external_profile_id,registered_at,created_at,updated_at,
    marketing_contact_identities(id,identity_type,raw_value,normalized_value,is_primary,is_valid,invalid_reason),
    marketing_contact_sources(id,source_type,source_url,group_url,post_url,source_label,discovered_at),
    marketing_contactability(id,identity_id,channel,recipient_category,eligibility_state,basis,evidence,evidence_date,review_date,reviewed_by)
  `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) {
    console.error("Marketing contacts query failed", error);
    return NextResponse.json(
      { error: "Contacts could not be loaded", code: "CONTACTS_QUERY_FAILED" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    mode: "database",
    contacts: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  });
}
