import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string; error?: string }>;
}) {
  if (await getAuthUser()) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <LoginForm
        redirectedFrom={sp.redirectedFrom ?? "/dashboard"}
        initialError={sp.error ? "Sign-in failed. Please try again." : null}
      />
    </main>
  );
}
