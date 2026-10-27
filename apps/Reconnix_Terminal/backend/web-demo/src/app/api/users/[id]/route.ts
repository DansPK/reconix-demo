import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // VULNERABLE: IDOR + excessive data exposure (returns email, address, plaintext password).
  const u = (await q("SELECT id, email, name, role, address, password FROM users WHERE id = $1", [id]))[0];
  return u ? NextResponse.json(u) : NextResponse.json({ error: "not found" }, { status: 404 });
}
