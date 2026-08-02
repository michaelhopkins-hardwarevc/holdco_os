"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "recover";

export function LoginForm({
  redirectedFrom,
  initialError,
}: {
  redirectedFrom: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(redirectedFrom);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push(redirectedFrom);
          router.refresh();
        } else {
          setNotice("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        // recover: email a password-reset link that returns to /account
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?redirectedFrom=/account`,
        });
        if (error) throw error;
        setNotice(
          "If an account exists for that email, a password-reset link is on its way. Open it to set a new password.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectedFrom=${encodeURIComponent(
          redirectedFrom,
        )}`,
      },
    });
    if (error) setError(error.message);
  }

  const title =
    mode === "signin"
      ? "Sign in to your account"
      : mode === "signup"
        ? "Create your account"
        : "Reset your password";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>HoldCo OS</CardTitle>
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "recover" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => switchMode("recover")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Sign up"
                  : "Send reset link"}
          </Button>
          {mode !== "recover" && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onGoogle}
              disabled={loading}
            >
              Continue with Google
            </Button>
          )}
          {mode === "signin" && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => switchMode("signup")}
            >
              Need an account? Sign up
            </button>
          )}
          {mode === "signup" && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => switchMode("signin")}
            >
              Have an account? Sign in
            </button>
          )}
          {mode === "recover" && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => switchMode("signin")}
            >
              Back to sign in
            </button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
