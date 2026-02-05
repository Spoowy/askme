import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createVerificationCode } from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const code = await createVerificationCode(email);

    // Send email
    await resend.emails.send({
      from: "Ask Questions <onboarding@resend.dev>",
      to: email,
      subject: "Your verification code",
      html: `<p>Your code is: <strong>${code}</strong></p><p>Expires in 10 minutes.</p>`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
