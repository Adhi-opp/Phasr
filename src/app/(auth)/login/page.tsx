"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { loginUser } from "@/features/auth/actions";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const showRegisteredNotice = searchParams.get("registered") === "1";
  const callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  const registerHref = callbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await loginUser({ email, password });
      if (!result.success) {
        setError(result.error);
        return;
      }

      // Full navigation, not router.push. signIn() sets the session cookie on
      // the server, but SessionProvider was seeded with the signed-out session
      // when this page first loaded and a client-side push does not re-seed it.
      // useSession() would still report "unauthenticated" on the next page,
      // which silently breaks anything gated on it — including resuming a
      // pending estimate save, which would bounce the user straight back here.
      window.location.assign(safeRedirectPath(callbackUrl));
    });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Use your account credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            {showRegisteredNotice && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Registration successful. Please sign in.
              </p>
            )}
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link className="font-semibold text-foreground underline underline-offset-4" href={registerHref}>
              Create an account
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
