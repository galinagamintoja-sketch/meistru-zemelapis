import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../../lib/supabase";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createServerSupabase();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await db.rpc("cleanup_public_jobs");
  if (error) return NextResponse.json({ error: "cleanup_failed" }, { status: 503 });
  return NextResponse.json(data);
}

export const GET = POST;
