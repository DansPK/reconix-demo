"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function Cart() {
  // Minimal demo cart; checkout trusts the client-supplied total (price tampering).
  const [total, setTotal] = useState("338.00");
  const [msg, setMsg] = useState("");
  async function checkout() {
    const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ product_id: 1, qty: 1 }], total: Number(total) }) });
    const d = await r.json(); setMsg(r.ok ? `Order #${d.orderId} placed for $${total}` : d.error || "Failed");
  }
  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex justify-between"><span>Aurora Wireless Headphones ×1</span><span>$199.00</span></div>
        <div className="flex justify-between"><span>Vortex Gaming Mouse ×1</span><span>$79.00</span></div>
        <div className="flex justify-between"><span>Lumen Desk Lamp ×1</span><span>$59.00</span></div>
        <label className="text-sm text-muted-foreground">Total charged to card (editable in this demo):</label>
        <Input value={total} onChange={(e) => setTotal(e.target.value)} />
        <Button className="w-full" onClick={checkout}>Checkout</Button>
        {msg && <p className="text-sm text-center">{msg}</p>}
      </CardContent></Card>
    </div>
  );
}
