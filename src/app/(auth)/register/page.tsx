"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { registerUser } from "@/features/auth/actions";
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

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get("role");
  const callbackUrl = searchParams.get("callbackUrl");
  const role = roleParam === "DEALER" ? "DEALER" : "HOMEOWNER";
  const accountLabel = role === "DEALER" ? "Dealer" : "Homeowner";
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await registerUser({
        name,
        email,
        password,
        confirmPassword,
        role,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      const params = new URLSearchParams({ registered: "1" });
      if (callbackUrl) {
        params.set("callbackUrl", callbackUrl);
      }
      router.push(`/login?${params.toString()}`);
    });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
      <Card className="w-full border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <CardHeader>
          <CardTitle>{`Create ${accountLabel} Account`}</CardTitle>
          <CardDescription>
            {role === "DEALER"
              ? "Register as a dealer to bid on verified electrical projects."
              : "Register as a homeowner to calculate estimates and find verified dealers."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <input type="hidden" name="role" value={role} readOnly />
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-semibold text-foreground underline underline-offset-4" href={loginHref}>
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
