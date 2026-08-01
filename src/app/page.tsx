import { redirect } from "next/navigation";

// Unauthenticated requests are redirected to /login by middleware; signed-in
// users land on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
