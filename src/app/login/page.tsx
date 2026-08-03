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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 22 22" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="8" stroke="var(--bone)" strokeWidth="1.4" />
          <path d="M11 1v6M11 15v6M1 11h6M15 11h6" stroke="var(--acid)" strokeWidth="1.4" />
        </svg>
        <div>
          <div className="font-display text-[17px] font-bold tracking-[-0.02em] text-bone">
            HoldCo OS
          </div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
            rev_02
          </div>
        </div>
      </div>
      <LoginForm
        redirectedFrom={sp.redirectedFrom ?? "/dashboard"}
        initialError={sp.error ? "Sign-in failed. Please try again." : null}
      />
    </main>
  );
}
