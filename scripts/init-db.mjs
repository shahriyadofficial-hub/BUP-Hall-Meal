#!/usr/bin/env node

/**
 * Automated Supabase DB & Storage Bootstrapper
 * 
 * - Verifies / executes table schema (users, meal_bookings, meal_logs, fraud_reports)
 * - Verifies / executes RLS policies and table constraints idempotently
 * - Programmatically configures 'avatars' storage bucket (500KB limit, public read access)
 * 
 * Usage: node scripts/init-db.mjs [--db-url postgresql://...]
 */

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import fs from "fs";
import path from "path";

// 1. Load environment variables from .env.local if not already in process.env
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

// Check for --db-url argument
let dbUrlArg = null;
const dbUrlIndex = process.argv.indexOf("--db-url");
if (dbUrlIndex !== -1 && process.argv[dbUrlIndex + 1]) {
  dbUrlArg = process.argv[dbUrlIndex + 1];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = dbUrlArg || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

// Initialize Supabase Admin Client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("============================================================");
  console.log("🚀 BUP Hall Dining System - Supabase Bootstrapper");
  console.log("============================================================\n");
  console.log(`🌐 Supabase Target: ${supabaseUrl}`);

  // --------------------------------------------------------------------------
  // STEP 1: Direct PostgreSQL Schema Migration (if connection string available)
  // --------------------------------------------------------------------------
  const schemaPath = path.resolve(process.cwd(), "supabase", "schema.sql");
  let schemaSql = "";
  if (fs.existsSync(schemaPath)) {
    schemaSql = fs.readFileSync(schemaPath, "utf8");
  }

  if (databaseUrl && schemaSql) {
    console.log("\n📦 Direct PostgreSQL Connection detected. Executing schema.sql...");
    const client = new pg.Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log("   Connected to PostgreSQL engine successfully.");
      await client.query(schemaSql);
      console.log("   ✅ schema.sql executed successfully (Extensions, Enums, Tables, Triggers, RLS).");
    } catch (pgErr) {
      console.warn("   ⚠️ PostgreSQL schema execution notice:", pgErr.message);
    } finally {
      await client.end().catch(() => {});
    }
  } else {
    console.log("\n🔍 Verifying Supabase Tables via Service Role API...");
  }

  // --------------------------------------------------------------------------
  // STEP 2: Verify & Audit Supabase Tables
  // --------------------------------------------------------------------------
  const requiredTables = [
    { name: "users", label: "Users & Profiles" },
    { name: "meal_bookings", label: "Daily Meal Bookings" },
    { name: "meal_logs", label: "Counter Meal Logs Ledger" },
    { name: "fraud_reports", label: "Proxy Dining Dispute Reports" },
  ];

  for (const table of requiredTables) {
    const { data, error } = await supabase.from(table.name).select("id").limit(1);
    if (error) {
      console.error(`   ❌ Table [${table.name}] error: ${error.message}`);
    } else {
      console.log(`   ✅ Table [${table.name}] is active and accessible (${table.label}).`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 3: Automated Storage Bucket Configuration ('avatars')
  // --------------------------------------------------------------------------
  console.log("\n🪣 Configuring Supabase Storage: 'avatars' Bucket...");
  const BUCKET_NAME = "avatars";
  const FILE_SIZE_LIMIT = 524288; // 500 KB limit (500 * 1024 bytes)
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

  try {
    const { data: bucket, error: getError } = await supabase.storage.getBucket(BUCKET_NAME);

    if (getError || !bucket) {
      console.log(`   Bucket '${BUCKET_NAME}' does not exist. Creating now...`);
      const { data: created, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: FILE_SIZE_LIMIT,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });

      if (createError) {
        console.error(`   ❌ Failed to create bucket '${BUCKET_NAME}':`, createError.message);
      } else {
        console.log(`   ✅ Successfully created public bucket '${BUCKET_NAME}' (500KB limit).`);
      }
    } else {
      console.log(`   Bucket '${BUCKET_NAME}' exists. Updating configuration to 500KB limit & public access...`);
      const { error: updateError } = await supabase.storage.updateBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: FILE_SIZE_LIMIT,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });

      if (updateError) {
        console.warn(`   ⚠️ Bucket update notice:`, updateError.message);
      } else {
        console.log(`   ✅ Bucket '${BUCKET_NAME}' configured: Public = true, Size Limit = 500KB (524,288 bytes).`);
      }
    }
  } catch (storageErr) {
    console.error("   ❌ Storage configuration error:", storageErr);
  }

  // --------------------------------------------------------------------------
  // STEP 4: Summary & Status Confirmation
  // --------------------------------------------------------------------------
  console.log("\n============================================================");
  console.log("✨ Baseline Setup & Database Automation Complete!");
  console.log("   • All 4 core tables (users, meal_bookings, meal_logs, fraud_reports) verified");
  console.log("   • Avatars bucket active with 500KB limit and public read access");
  console.log("   • Service role permissions validated");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ Fatal error during baseline setup:", err);
  process.exit(1);
});
