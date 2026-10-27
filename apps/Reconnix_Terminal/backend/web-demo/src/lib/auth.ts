import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

// Planted vuln: weak, hardcoded fallback secret -> forgeable JWTs.
const SECRET = process.env.JWT_SECRET || "secret";

export type Session = { uid: number; role: string; email: string };

export function sign(session: Session): string {
  return jwt.sign(session, SECRET);
}

export function verify(token?: string): Session | null {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET) as Session;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<Session | null> {
  const token = (await cookies()).get("token")?.value;
  return verify(token);
}
