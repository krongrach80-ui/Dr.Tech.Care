import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const SEED_FILE = path.resolve('supabase/seed.dev.sql');
const TEST_FILE = path.resolve('supabase/tests/rls_negative_test.sql');
const COMBINED_OUTPUT = path.resolve('supabase/all_staging_migrations.sql');

console.log('========================================================');
console.log('DR.TECH.CARE: Staging Database Migration Bundler');
console.log('========================================================\n');

const migrationFiles = [
  '20261019000001_core_schema_and_extensions.sql',
  '20261019000002_security_helpers_and_rls.sql',
  '20261019000003_storage_buckets.sql',
  '20261019000004_autoreschedule_cron.sql',
];

let combinedSql = `-- ========================================================\n-- DR.TECH.CARE COMBINED STAGING MIGRATION BUNDLE\n-- Generated: ${new Date().toISOString()}\n-- ========================================================\n\n`;

for (const file of migrationFiles) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ Loading migration: ${file}`);
    combinedSql += `\n-- >>> FILE: ${file} <<<\n` + fs.readFileSync(filePath, 'utf8') + '\n';
  } else {
    console.error(`❌ Missing migration file: ${file}`);
  }
}

if (fs.existsSync(SEED_FILE)) {
  console.log(`✓ Loading seed: supabase/seed.dev.sql`);
  combinedSql += `\n-- >>> FILE: seed.dev.sql <<<\n` + fs.readFileSync(SEED_FILE, 'utf8') + '\n';
}

if (fs.existsSync(TEST_FILE)) {
  console.log(`✓ Loading test suite: supabase/tests/rls_negative_test.sql`);
  combinedSql += `\n-- >>> FILE: rls_negative_test.sql <<<\n` + fs.readFileSync(TEST_FILE, 'utf8') + '\n';
}

fs.writeFileSync(COMBINED_OUTPUT, combinedSql, 'utf8');
console.log(`\n🎉 Success! Combined staging migration script saved to:`);
console.log(`   ${COMBINED_OUTPUT} (${(combinedSql.length / 1024).toFixed(1)} KB)`);
console.log(`\nHow to execute on your Staging Supabase project:`);
console.log(`1. Open your Supabase Staging Dashboard -> SQL Editor`);
console.log(`2. Paste the contents of supabase/all_staging_migrations.sql and click RUN`);
console.log(`3. Or if Supabase CLI is linked: 'supabase db push'`);
