"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (r.ok) location.href = "/account"; else setErr((await r.json()).error || "Login failed");
  }
  return (
    <div className="max-w-sm mx-auto">
      <Card>
        <CardHeader><CardTitle>Sign in to ShopWave</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button className="w-full" type="submit">Sign in</Button>
            <p className="text-xs text-muted-foreground text-center">Try alice@example.com / password1 · or register</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
