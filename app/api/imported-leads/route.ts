import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../lib/auth-session";
import { createServerSupabase } from "../../../lib/supabase";

export async function GET(request: Request) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ mode: "seed", leads: [] });
  }

  const { data, error } = await supabase
    .from("imported_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode: "database", leads: data ?? [] });
}

export async function POST(request: Request) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const body = await request.json();
  const leads: Array<Record<string, unknown>> = Array.isArray(body.leads) ? body.leads : [];

  if (!leads.length) {
    return NextResponse.json({ error: "No leads supplied" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed", imported: leads.length });
  }

  const { error } = await supabase.from("imported_leads").insert(
    leads.map((lead) => ({
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      city: lead.city ?? null,
      service_type: lead.serviceType ?? lead.service_type ?? null,
      source_url: lead.sourceUrl ?? lead.source_url ?? null,
      source_note: lead.sourceNote ?? lead.source_note ?? null,
      original_note: lead.originalNote ?? lead.original_note ?? null,
      invitation_status: "not contacted",
      consent_status: "unknown"
    }))
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: leads.length });
}
