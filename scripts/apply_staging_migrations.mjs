import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const SEED_FILE = path.resolve('supabase/seed.dev.sql');
const TEST_FILE = path.resolve('supabase/tests/rls_negative_test.sql');

const ALL_MIGRATIONS_OUTPUT = path.resolve('supabase/all_migrations.sql');
const DEV_EXTRAS_OUTPUT = path.resolve('supabase/dev_extras.sql');
const LEGACY_OUTPUT = path.resolve('supabase/all_staging_migrations.sql');

console.log('========================================================');
console.log('DR.TECH.CARE: Database Migration & Dev Extras Bundler');
console.log('========================================================\n');

// 1. Bundle all_migrations.sql
// (schema, helpers, RLS, triggers, buckets, cron, production reference data)
const migrationFiles = [
  '20261019000001_core_schema_and_extensions.sql',
  '20261019000002_security_helpers_and_rls.sql',
  '20261019000003_storage_buckets.sql',
  '20261019000004_autoreschedule_cron.sql',
];

let migrationsSql = `-- ========================================================\n-- DR.TECH.CARE: ALL PRODUCTION & STAGING MIGRATIONS\n-- Includes: Core Schema, Extensions, Helpers, Strict RLS,\n--           Triggers, Storage Buckets, Autoreschedule Cron,\n--           and Reference Data (Settings & Clinical Mini-Games).\n-- Generated: ${new Date().toISOString()}\n-- ========================================================\n\n`;

for (const file of migrationFiles) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ Loading migration: ${file}`);
    migrationsSql += `\n-- >>> FILE: ${file} <<<\n` + fs.readFileSync(filePath, 'utf8') + '\n';
  } else {
    console.error(`❌ Missing migration file: ${file}`);
  }
}

fs.writeFileSync(ALL_MIGRATIONS_OUTPUT, migrationsSql, 'utf8');
console.log(`\n🎉 Success! [all_migrations.sql] generated:`);
console.log(`   ${ALL_MIGRATIONS_OUTPUT} (${(migrationsSql.length / 1024).toFixed(1)} KB)`);

// 2. Bundle dev_extras.sql
// (seed.dev.sql + test suite, staging only)
let devExtrasSql = `-- ========================================================\n-- DR.TECH.CARE: DEV & STAGING EXTRAS (STAGING ONLY)\n-- Includes: Staging Seed Fixtures & Real-Table RLS Test Suite\n-- Note: Test suite is wrapped in BEGIN ... ROLLBACK.\n-- Generated: ${new Date().toISOString()}\n-- ========================================================\n\n`;

if (fs.existsSync(SEED_FILE)) {
  console.log(`✓ Loading staging seed: supabase/seed.dev.sql`);
  devExtrasSql += `\n-- >>> FILE: seed.dev.sql <<<\n` + fs.readFileSync(SEED_FILE, 'utf8') + '\n';
}

if (fs.existsSync(TEST_FILE)) {
  console.log(`✓ Loading test suite: supabase/tests/rls_negative_test.sql`);
  devExtrasSql += `\n-- >>> FILE: rls_negative_test.sql <<<\n` + fs.readFileSync(TEST_FILE, 'utf8') + '\n';
}

fs.writeFileSync(DEV_EXTRAS_OUTPUT, devExtrasSql, 'utf8');
console.log(`\n🎉 Success! [dev_extras.sql] generated:`);
console.log(`   ${DEV_EXTRAS_OUTPUT} (${(devExtrasSql.length / 1024).toFixed(1)} KB)`);

// Clean up legacy bundle if present
if (fs.existsSync(LEGACY_OUTPUT)) {
  fs.unlinkSync(LEGACY_OUTPUT);
  console.log(`✓ Removed obsolete legacy file: supabase/all_staging_migrations.sql`);
}

console.log(`\nDeployment Guidance:`);
console.log(`1. Run supabase/all_migrations.sql first in Supabase SQL Editor.`);
console.log(`2. On Staging only: run supabase/dev_extras.sql to load staging fixtures and execute the test suite.`);
