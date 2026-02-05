import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, getConversations, createConversation, deleteConversation } from "@/lib/db";

// Get device_id from header
function getDeviceId(req: NextRequest): string | null {
  return req.headers.get("x-device-id");
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  const user = token ? await getUserFromToken(token) : null;
  const deviceId = getDeviceId(req);

  // Need either user or deviceId
  if (!user && !deviceId) {
    return NextResponse.json({ conversations: [] });
  }

  const conversations = await getConversations(
    user ? { userId: user.id } : { deviceId: deviceId! }
  );
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  const user = token ? await getUserFromToken(token) : null;
  const deviceId = getDeviceId(req);

  if (!user && !deviceId) {
    return NextResponse.json({ error: "No identity" }, { status: 400 });
  }

  const id = await createConversation(
    user ? { userId: user.id } : { deviceId: deviceId! }
  );
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  const user = token ? await getUserFromToken(token) : null;
  const deviceId = getDeviceId(req);

  if (!user && !deviceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  await deleteConversation(id);
  return NextResponse.json({ success: true });
}
