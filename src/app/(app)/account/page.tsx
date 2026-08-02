import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { requireContext } from "@/lib/auth";

export default async function AccountPage() {
  const ctx = await requireContext();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">Signed in as {ctx.appUser.email}</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Set a new password. If you arrived here from a reset or invite email,
            this is where you choose your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
