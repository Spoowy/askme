import { NextRequest, NextResponse } from "next/server";
import { getAnonCount } from "@/lib/db";

// Get client IP from headers
function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

export async function GET(req: NextRequest) {
  const ip = getIP(req);
  const count = await getAnonCount(ip);
  return NextResponse.json({ count });
}
