import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";

export async function GET() {
  const db = createServerSupabase();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const [trades, areas] = await Promise.all([
    db.from("service_subcategories").select("id,name,slug").eq("is_active", true).order("name"),
    db.from("job_areas").select("id,name,kind,aliases").eq("is_active", true).order("name")
  ]);
  if (trades.error || areas.error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ schema_version: 1, trades: trades.data, areas: areas.data },
    { headers: { "Cache-Control": "public, max-age=300" } });
}
