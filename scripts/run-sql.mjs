#!/usr/bin/env node
/**
 * scripts/run-sql.mjs
 * DR.TECH.CARE: Direct SQL Runner against Staging Database
 *
 * Safety Rules:
 *  1. Refuses to run unless TARGET_ENV === 'staging'.
 *  2. Refuses to run if DB host matches PRODUCTION_DB_HOST (or if host is production).
 *  3. Requires --i-know-this-is-staging flag if any file is legacy_baseline.sql.
 *  4. Sets app.allow_destructive_baseline = 'yes' for staging runs requiring baseline.
 *  5. Prints every SQL error with filename, line number, column, and context lines.
 *  6. Exits non-zero on any error.
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Automatically load .env.staging if present
const stagingEnvPath = path.resolve('.env.staging');
if (fs.existsSync(stagingEnvPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(stagingEnvPath);
  }
}

const args = process.argv.slice(2);
const allowDestructiveFlag = args.includes('--i-know-this-is-staging');
const sqlFileArgs = args.filter(arg => !arg.startsWith('--'));

if (sqlFileArgs.length === 0) {
  console.error('❌ Error: No SQL files specified.');
  console.error('Usage: node scripts/run-sql.mjs [--i-know-this-is-staging] <path/to/file1.sql> [path/to/file2.sql ...]');
  process.exit(1);
}

// 1. Check TARGET_ENV
const targetEnv = process.env.TARGET_ENV;
if (targetEnv !== 'staging') {
  console.error(`❌ Refusal: TARGET_ENV must be explicitly set to 'staging'. Current: '${targetEnv || '<unset>'}'`);
  console.error('   Export TARGET_ENV=staging in .env.staging or your shell before executing.');
  process.exit(1);
}

// 2. Check STAGING_DB_URL
const dbUrl = process.env.STAGING_DB_URL;
if (!dbUrl) {
  console.error('❌ Refusal: STAGING_DB_URL environment variable is not set.');
  console.error('   Please provide a valid PostgreSQL connection string in .env.staging:');
  console.error('   STAGING_DB_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres"');
  process.exit(1);
}

// 3. Check Host against PRODUCTION_DB_HOST
let parsedUrl;
try {
  parsedUrl = new URL(dbUrl);
} catch (e) {
  console.error('❌ Invalid STAGING_DB_URL connection string:', e.message);
  process.exit(1);
}

const dbHost = parsedUrl.hostname.toLowerCase();
const prodHost = (process.env.PRODUCTION_DB_HOST || '').trim().toLowerCase();

if (prodHost && dbHost === prodHost) {
  console.error(`🚨 CRITICAL SAFETY REFUSAL: Target DB host '${dbHost}' matches PRODUCTION_DB_HOST ('${prodHost}')!`);
  console.error('   Execution aborted immediately to protect production data.');
  process.exit(1);
}

// Guard against suspicious production keywords in host if PRODUCTION_DB_HOST was not set
if (!prodHost && (dbHost.includes('prod') || dbHost.includes('production'))) {
  console.error(`🚨 CRITICAL SAFETY REFUSAL: Target DB host '${dbHost}' appears to be production.`);
  console.error('   If this is actually staging, set PRODUCTION_DB_HOST to your real production host.');
  process.exit(1);
}

// 4. Check for legacy_baseline.sql guard
const includesBaseline = sqlFileArgs.some(f => path.basename(f) === 'legacy_baseline.sql');
if (includesBaseline && !allowDestructiveFlag) {
  console.error('🚨 SAFETY REFUSAL: Attempting to run legacy_baseline.sql without confirmation flag.');
  console.error('   legacy_baseline.sql is DESTRUCTIVE and drops tables.');
  console.error('   You must pass --i-know-this-is-staging to run legacy_baseline.sql on staging.');
  process.exit(1);
}

// 5. Connect and execute
async function run() {
  console.log('========================================================');
  console.log('DR.TECH.CARE: Staging SQL Runner');
  console.log(`Target Host: ${dbHost}`);
  console.log(`Target Port: ${parsedUrl.port || 5432}`);
  console.log(`Database:    ${parsedUrl.pathname.replace(/^\//, '')}`);
  console.log(`Files (${sqlFileArgs.length}):`);
  sqlFileArgs.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));
  console.log('========================================================\n');

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000 // 2 minutes
  });

  try {
    await client.connect();
    console.log('✓ Connected successfully to database.\n');

    // If running with destructive confirmation, set session setting
    if (allowDestructiveFlag) {
      await client.query("SET app.allow_destructive_baseline = 'yes';");
      console.log("✓ Session setting set: app.allow_destructive_baseline = 'yes'");
    }

    for (let i = 0; i < sqlFileArgs.length; i++) {
      const filePath = sqlFileArgs[i];
      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const sqlContent = fs.readFileSync(resolvedPath, 'utf8');
      console.log(`>>> [${i + 1}/${sqlFileArgs.length}] Executing: ${filePath} (${(sqlContent.length / 1024).toFixed(1)} KB)...`);
      const startTime = Date.now();

      try {
        await client.query(sqlContent);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✓ Completed: ${filePath} in ${duration}s\n`);
      } catch (err) {
        console.error(`\n❌ ERROR EXECUTING ${filePath}`);
        
        let lineInfo = '';
        let snippet = '';
        if (err.position) {
          const charIndex = parseInt(err.position, 10);
          if (!isNaN(charIndex) && charIndex > 0) {
            const upToError = sqlContent.slice(0, charIndex);
            const lines = upToError.split('\n');
            const errorLineNum = lines.length;
            const errorColNum = lines[lines.length - 1].length;
            lineInfo = ` at line ${errorLineNum}:${errorColNum}`;

            const allLines = sqlContent.split('\n');
            const startContext = Math.max(0, errorLineNum - 4);
            const endContext = Math.min(allLines.length, errorLineNum + 3);
            snippet = '\nCode Context:\n' + allLines.slice(startContext, endContext).map((l, idx) => {
              const currentLine = startContext + idx + 1;
              const marker = currentLine === errorLineNum ? '>> ' : '   ';
              return `${marker}${String(currentLine).padStart(5, ' ')} | ${l}`;
            }).join('\n');
          }
        }

        console.error(`PostgreSQL Error${lineInfo}:`);
        console.error(`Message: ${err.message}`);
        if (err.detail) console.error(`Detail:  ${err.detail}`);
        if (err.hint) console.error(`Hint:    ${err.hint}`);
        if (err.where) console.error(`Where:   ${err.where}`);
        if (snippet) console.error(snippet);
        console.error('');

        throw err;
      }
    }

    console.log('🎉 ALL SQL FILES EXECUTED SUCCESSFULLY WITHOUT ERRORS.');
  } catch (err) {
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run();
