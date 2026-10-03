import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load environment variables if not already set by --env-file
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log("Running retroactive BUP Edu-mail auto-approval migration...");

  // Query unapproved users
  const { data: users, error: fetchErr } = await supabase
    .from("users")
    .select("id, email, student_id, full_name, is_approved")
    .eq("is_approved", false);

  if (fetchErr) {
    console.error("Error fetching unapproved users:", fetchErr);
    process.exit(1);
  }

  console.log(`Found ${users?.length || 0} unapproved user(s).`);

  const usersToApprove = (users || []).filter((u) => {
    if (!u.email) return false;
    const lower = u.email.trim().toLowerCase();
    return lower.endsWith("@student.bup.edu.bd") || lower.endsWith("@bup.edu.bd");
  });

  console.log(`Identified ${usersToApprove.length} BUP edu-mail user(s) requiring retroactive auto-approval.`);

  for (const user of usersToApprove) {
    console.log(`Approving user: ${user.full_name} (${user.student_id}) - ${user.email}`);
    const { error: updateErr } = await supabase
      .from("users")
      .update({ is_approved: true })
      .eq("id", user.id);

    if (updateErr) {
      console.error(`Failed to approve user ${user.id}:`, updateErr);
    } else {
      console.log(`Successfully approved user ${user.id}`);
    }
  }

  // Also verify all users state
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, email, student_id, is_approved");
  console.log("Current users in database:", allUsers);
  console.log("Migration complete!");
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
