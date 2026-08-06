import { NextResponse } from "next/server";
import { claimAndProcessAccountDeletions } from "../../../../../lib/account-deletion";

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  return Boolean(secret && header === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await claimAndProcessAccountDeletions({ batchSize: 10 }));
  } catch {
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = POST;
