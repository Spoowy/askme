import { NextRequest, NextResponse } from "next/server";
import { verifyCodeAndCreateSession, migrateConversationsToUser, getUserFromToken } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, code, deviceId } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
    }

    const token = await verifyCodeAndCreateSession(email, code);

    if (!token) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    // Migrate anonymous conversations to user account
    if (deviceId) {
      const user = await getUserFromToken(token);
      if (user) {
        await migrateConversationsToUser(deviceId, user.id);
      }
    }

    // Set cookie with token
    const response = NextResponse.json({ success: true });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
