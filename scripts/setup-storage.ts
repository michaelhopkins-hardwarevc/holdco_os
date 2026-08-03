import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// One-time: create the private "receipts" bucket for expense receipts. Safe to
// re-run. Requires SUPABASE_SERVICE_ROLE_KEY.
config({ path: ".env.local" });
config();

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin.storage.createBucket("receipts", {
    public: false,
    fileSizeLimit: "10MB",
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error("Failed to create bucket:", error.message);
    process.exit(1);
  }
  console.log("receipts bucket ready");
}

main();
