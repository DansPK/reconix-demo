import Link from "next/link";
import { ShoppingCart, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/auth";

export async function Navbar() {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Shop<span className="text-primary">Wave</span>
        </Link>
        <form action="/search" className="ml-4 flex-1 max-w-md hidden sm:flex items-center relative">
          <Search className="absolute left-3 size-4 text-muted-foreground" />
          <input name="q" placeholder="Search products…"
            className="w-full h-9 rounded-md border bg-background pl-9 pr-3 text-sm" />
        </form>
        <nav className="ml-auto flex items-center gap-1">
          {user?.role === "admin" && (
            <Button asChild variant="ghost" size="sm"><Link href="/admin">Admin</Link></Button>
          )}
          <Button asChild variant="ghost" size="icon"><Link href="/cart"><ShoppingCart /></Link></Button>
          {user ? (
            <Button asChild variant="ghost" size="sm"><Link href="/account"><User className="mr-1" />{user.email.split("@")[0]}</Link></Button>
          ) : (
            <Button asChild size="sm"><Link href="/login">Sign in</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}
