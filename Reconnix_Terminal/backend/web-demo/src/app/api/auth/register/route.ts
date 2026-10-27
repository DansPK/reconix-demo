import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { sign } from "@/lib/auth";
export async function POST(req: Request) {
  const { email, password, name } = await req.json();
  try {
    const rows = await q(
      "INSERT INTO users (email, password, name, role) VALUES ($1,$2,$3,'user') RETURNING id, email, role",
      [email, password, name || email]
    );
    const u = rows[0];
    const res = NextResponse.json({ ok: true, user: u });
    res.cookies.set("token", sign({ uid: u.id, role: u.role, email: u.email }), { httpOnly: true, path: "/" });
    return res;
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
