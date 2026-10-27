"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Register() {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (r.ok) location.href = "/account"; else setErr((await r.json()).error || "Failed");
  }
  return (
    <div className="max-w-sm mx-auto">
      <Card><CardHeader><CardTitle>Create your account</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input placeholder="Name" onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Input placeholder="Email" onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Input type="password" placeholder="Password" onChange={(e) => setF({ ...f, password: e.target.value })} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button className="w-full" type="submit">Create account</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
