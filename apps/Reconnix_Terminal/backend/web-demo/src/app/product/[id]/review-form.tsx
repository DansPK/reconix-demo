"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReviewForm({ productId }: { productId: number }) {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, author, body, stars: 5 }),
    });
    setDone(true); location.reload();
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-2">
      <div className="text-sm font-medium">Write a review</div>
      <Input placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <Input placeholder="Your review" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" disabled={done}>Post review</Button>
    </form>
  );
}
