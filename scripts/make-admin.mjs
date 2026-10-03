#!/usr/bin/env node

/**
 * CLI utility to elevate a user to Admin role in the BUP Hall Dining System.
 * Usage: node scripts/make-admin.mjs <email>
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 1. Parse CLI arguments
const emailArg = process.argv[2]?.trim();

if (!emailArg) {
  console.error("❌ Error: Missing email argument.");
  console.log("Usage: node scripts/make-admin.mjs <email>");
  console.log("Example: node scripts/make-admin.mjs admin@bup.edu.bd");
  process.exit(1);
}

const targetEmail = emailArg.toLowerCase();

// 2. Load environment variables from .env.local if not in process.env
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip outer quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// 3. Initialize Supabase Admin Client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function makeAdmin() {
  console.log(`🔍 Looking up user: ${targetEmail}...`);

  // Step 1: Find user in public.users
  const { data: users, error: findError } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_approved")
    .ilike("email", targetEmail);

  if (findError) {
    console.error("❌ Error querying public.users:", findError.message);
    process.exit(1);
  }

  let userRecord = users && users.length > 0 ? users[0] : null;

  // If not found in public.users, check auth.users via admin API
  if (!userRecord) {
    console.log(`⚠️ User not found in public.users, checking auth.users...`);
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
      console.error("❌ Error listing auth users:", authErr.message);
      process.exit(1);
    }

    const matchedAuthUser = authData.users.find(
      (u) => u.email?.toLowerCase() === targetEmail
    );

    if (!matchedAuthUser) {
      console.error(`❌ User with email "${targetEmail}" was not found in either public.users or auth.users.`);
      process.exit(1);
    }

    console.log(`Found auth user ID ${matchedAuthUser.id}. Creating profile record in public.users...`);
    const { data: inserted, error: insertErr } = await supabase
      .from("users")
      .upsert({
        id: matchedAuthUser.id,
        email: matchedAuthUser.email,
        full_name: matchedAuthUser.user_metadata?.full_name || matchedAuthUser.email?.split("@")[0] || "Admin User",
        student_id: "ADMIN-" + matchedAuthUser.id.slice(0, 6),
        hall: "male",
        room_number: "ADMIN-OFFICE",
        phone_number: "01700000000",
        dining_pin_hash: "admin",
        role: "admin",
        is_approved: true,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("❌ Failed to create public.users profile:", insertErr.message);
      process.exit(1);
    }

    userRecord = inserted;
  }

  // Step 2: Update role = 'admin' and is_approved = true in public.users
  const { error: updateError } = await supabase
    .from("users")
    .update({
      role: "admin",
      is_approved: true,
    })
    .eq("id", userRecord.id);

  if (updateError) {
    console.error(`❌ Failed to update role in public.users:`, updateError.message);
    process.exit(1);
  }

  // Step 3: Update app_metadata and user_metadata in Supabase Auth
  try {
    await supabase.auth.admin.updateUserById(userRecord.id, {
      app_metadata: { role: "admin" },
      user_metadata: { role: "admin" },
    });
  } catch (authUpdateErr) {
    console.warn("⚠️ Warning: Could not update auth user metadata:", authUpdateErr);
  }

  // Step 4: Success confirmation
  console.log(`✅ Successfully promoted [${targetEmail}] to Admin.`);
}

makeAdmin().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
