import { NextResponse } from "next/server";
import { rawUnsafe } from "@/lib/db";
import { sign } from "@/lib/auth";
export async function POST(req: Request) {
  const { email, password } = await req.json();
  try {
    // VULNERABLE: credentials interpolated into SQL -> auth bypass (' OR '1'='1).
    const rows = await rawUnsafe(
      `SELECT id, email, role FROM users WHERE email = '${email}' AND password = '${password}'`
    );
    if (!rows[0]) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const u = rows[0];
    const token = sign({ uid: u.id, role: u.role, email: u.email });
    const res = NextResponse.json({ ok: true, user: u });
    res.cookies.set("token", token, { httpOnly: true, path: "/" });
    return res;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
