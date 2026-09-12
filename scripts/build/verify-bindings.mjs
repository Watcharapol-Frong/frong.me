#!/usr/bin/env node

/**
 * Pre-flight verification for Cloudflare staging deployment.
 *
 * Verifies that the wrangler.jsonc configuration and the staging build environment
 * are properly wired before deploying to staging:
 * 1. All five SSOT variables are present and non-blank, including legacy fallback resolution.
 * 2. D1 database binding matches CF_D1_DATABASE_ID (legacy: STAGING_D1_DATABASE_ID).
 * 3. R2 bucket binding matches CF_R2_BUCKET_NAME (legacy: STAGING_R2_BUCKET_NAME).
 * 4. Configured Access Application AUD (if present in wrangler.jsonc) matches CF_ACCESS_AUD.
 * 5. Dev-bypass guard: ENABLE_ACCESS_DEV_BYPASS must NEVER be true in staging build env.
 * 6. Production isolation: verifies staging bindings never point to env.production.
 *
 * Parses wrangler.jsonc using jsonc-parser (never raw JSON.parse) and fails loudly on syntax errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, printParseErrorCode } from 'jsonc-parser';

export class BindingVerificationError extends Error {
  /**
   * @param {string} message
   * @param {string} [checkName]
   */
  constructor(message, checkName) {
    super(message);
    this.name = 'BindingVerificationError';
    this.checkName = checkName;
  }
}

/**
 * Resolves one required SSOT environment variable without allowing an explicitly
 * blank value to fall through to another source. GitHub Actions resolves
 * unavailable vars/secrets to an empty string, so accepting a later fallback here
 * could hide a misconfigured canonical variable.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} canonicalName
 * @param {string[]} [legacyNames]
 * @returns {string}
 */
export function requiredSsotVariable(env, canonicalName, legacyNames = []) {
  for (const variableName of [canonicalName, ...legacyNames]) {
    const rawValue = env[variableName];
    if (rawValue === undefined || rawValue === null) continue;

    const value = String(rawValue).trim();
    if (!value) {
      const sourceDetail = variableName === canonicalName
        ? `${canonicalName} resolved to an empty string`
        : `legacy fallback ${variableName} resolved to an empty string`;
      throw new BindingVerificationError(
        `Missing required environment variable: ${canonicalName} (${sourceDetail})`,
        'missing-env-var'
      );
    }
    return value;
  }

  const legacyDetail = legacyNames.length > 0 ? ` (legacy: ${legacyNames.join(', ')})` : '';
  throw new BindingVerificationError(
    `Missing required environment variable: ${canonicalName}${legacyDetail}`,
    'missing-env-var'
  );
}

/**
 * Parses a JSONC file safely using jsonc-parser.
 * Never falls back to raw JSON.parse or ignores syntax errors.
 *
 * @param {string} configPath
 * @returns {Record<string, any>}
 */
export function parseWranglerJsonc(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new BindingVerificationError(`Configuration file not found: ${configPath}`, 'config-file');
  }

  const rawContent = fs.readFileSync(configPath, 'utf8');
  const parseErrors = [];
  const config = parse(rawContent, parseErrors, { allowTrailingComma: true });

  if (parseErrors.length > 0) {
    const errorDetails = parseErrors
      .map((err) => `[offset ${err.offset}, length ${err.length}: ${printParseErrorCode(err.error)}]`)
      .join(', ');
    throw new BindingVerificationError(
      `Failed to parse JSONC in ${configPath}: ${errorDetails}`,
      'jsonc-syntax'
    );
  }

  if (!config || typeof config !== 'object') {
    throw new BindingVerificationError(
      `Invalid configuration in ${configPath}: root must be a JSON object`,
      'jsonc-structure'
    );
  }

  return config;
}

/**
 * Performs pre-flight verification on bindings and staging environment variables.
 *
 * @param {object} [options]
 * @param {string} [options.configPath]
 * @param {string} [options.envName]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.dryRun]
 * @param {(msg: string) => void} [options.log]
 * @returns {{ success: boolean, accountId: string, d1DatabaseId: string, r2BucketName: string, accessTeamDomain: string, accessAud: string, configuredAud: string | null, devBypass: boolean, dryRun: boolean }}
 */
export function verifyBindings({
  configPath = path.resolve(process.cwd(), 'wrangler.jsonc'),
  envName = 'staging',
  env = process.env,
  dryRun = false,
  log = console.log,
} = {}) {
  // Check: Dev-bypass guard must fail immediately under any condition if set to true
  const bypassVal = (env.ENABLE_ACCESS_DEV_BYPASS ?? '').trim().toLowerCase();
  if (bypassVal === 'true' || bypassVal === '1' || bypassVal === 'yes') {
    throw new BindingVerificationError(
      `CRITICAL SECURITY VIOLATION: ENABLE_ACCESS_DEV_BYPASS is set to "${env.ENABLE_ACCESS_DEV_BYPASS}". Development bypass is strictly forbidden in staging build environments!`,
      'dev-bypass'
    );
  }

  // Validate the five canonical variables before reading binding configuration,
  // so an empty GitHub vars/secrets resolution stops the pre-flight immediately.
  // Legacy names remain temporary, explicitly identified fallback sources.
  const cloudflareAccountId = requiredSsotVariable(env, 'CLOUDFLARE_ACCOUNT_ID', ['CF_ACCOUNT_ID']);
  const stagingD1DbId = requiredSsotVariable(env, 'CF_D1_DATABASE_ID', ['STAGING_D1_DATABASE_ID']);
  const stagingR2BucketName = requiredSsotVariable(env, 'CF_R2_BUCKET_NAME', ['STAGING_R2_BUCKET_NAME']);
  const cfAccessTeamDomain = requiredSsotVariable(env, 'CF_ACCESS_TEAM_DOMAIN');
  const cfAccessAud = requiredSsotVariable(env, 'CF_ACCESS_AUD');

  // Parse wrangler.jsonc using JSONC-safe parser
  const config = parseWranglerJsonc(configPath);

  // Ensure target env section exists
  const targetEnvConfig = config.env?.[envName];
  if (!targetEnvConfig || typeof targetEnvConfig !== 'object') {
    throw new BindingVerificationError(
      `Missing "env.${envName}" configuration block in ${configPath}`,
      'missing-env'
    );
  }

  // D1 database verification
  const d1Databases = targetEnvConfig.d1_databases;
  if (!Array.isArray(d1Databases) || d1Databases.length === 0) {
    throw new BindingVerificationError(
      `env.${envName}.d1_databases is missing or empty in ${configPath}`,
      'd1-binding'
    );
  }
  const matchingD1 = d1Databases.find((db) => db.database_id === stagingD1DbId);
  if (!matchingD1) {
    const foundIds = d1Databases.map((db) => db.database_id).join(', ');
    throw new BindingVerificationError(
      `D1 database binding mismatch: env.${envName}.d1_databases does not contain database_id matching CF_D1_DATABASE_ID. Expected: "${stagingD1DbId}", Found: [${foundIds}]`,
      'd1-binding'
    );
  }

  // R2 bucket verification
  const r2Buckets = targetEnvConfig.r2_buckets;
  if (!Array.isArray(r2Buckets) || r2Buckets.length === 0) {
    throw new BindingVerificationError(
      `env.${envName}.r2_buckets is missing or empty in ${configPath}`,
      'r2-binding'
    );
  }
  const matchingR2 = r2Buckets.find((bucket) => bucket.bucket_name === stagingR2BucketName);
  if (!matchingR2) {
    const foundBuckets = r2Buckets.map((b) => b.bucket_name).join(', ');
    throw new BindingVerificationError(
      `R2 bucket binding mismatch: env.${envName}.r2_buckets does not contain bucket_name matching CF_R2_BUCKET_NAME. Expected: "${stagingR2BucketName}", Found: [${foundBuckets}]`,
      'r2-binding'
    );
  }

  // Access Application AUD verification (if present in wrangler.jsonc)
  const configuredAud =
    targetEnvConfig.vars?.CF_ACCESS_AUD ??
    targetEnvConfig.vars?.ACCESS_AUD ??
    targetEnvConfig.access?.aud ??
    config.vars?.CF_ACCESS_AUD;

  if (configuredAud !== undefined && configuredAud !== null && configuredAud !== '') {
    if (configuredAud !== cfAccessAud) {
      throw new BindingVerificationError(
        `Access Application AUD mismatch: configured in wrangler.jsonc as "${configuredAud}", but CF_ACCESS_AUD is "${cfAccessAud}"`,
        'aud-mismatch'
      );
    }
  }

  // Production isolation: ensure staging never points to env.production
  if (config.env?.production) {
    const prodD1Databases = Array.isArray(config.env.production.d1_databases)
      ? config.env.production.d1_databases
      : [];
    for (const d1 of d1Databases) {
      if (prodD1Databases.some((p) => p.database_id === d1.database_id)) {
        throw new BindingVerificationError(
          `Production isolation failure: staging D1 database ID "${d1.database_id}" matches a database in env.production!`,
          'prod-isolation'
        );
      }
    }

    const prodR2Buckets = Array.isArray(config.env.production.r2_buckets)
      ? config.env.production.r2_buckets
      : [];
    for (const r2 of r2Buckets) {
      if (prodR2Buckets.some((p) => p.bucket_name === r2.bucket_name)) {
        throw new BindingVerificationError(
          `Production isolation failure: staging R2 bucket "${r2.bucket_name}" matches a bucket in env.production!`,
          'prod-isolation'
        );
      }
    }
  }

  // Ensure staging binding names do not point at production
  for (const d1 of d1Databases) {
    const dbName = (d1.database_name ?? '').toLowerCase();
    if (dbName.includes('production') || dbName.endsWith('-prod')) {
      throw new BindingVerificationError(
        `Production isolation failure: staging D1 database name "${d1.database_name}" points at production!`,
        'prod-isolation'
      );
    }
  }

  for (const r2 of r2Buckets) {
    const bName = (r2.bucket_name ?? '').toLowerCase();
    if (bName.includes('production') || bName.endsWith('-prod')) {
      throw new BindingVerificationError(
        `Production isolation failure: staging R2 bucket name "${r2.bucket_name}" points at production!`,
        'prod-isolation'
      );
    }
  }

  // Log summary
  if (dryRun) {
    log('[verify-bindings] Running in --dry-run mode.');
  }
  log('[verify-bindings] Check 1/5: Required SSOT variables are present and non-blank: PASSED');
  log(`[verify-bindings] Check 2/5: D1 database ID matches CF_D1_DATABASE_ID: PASSED (${stagingD1DbId})`);
  log(`[verify-bindings] Check 3/5: R2 bucket name matches CF_R2_BUCKET_NAME: PASSED (${stagingR2BucketName})`);
  if (configuredAud) {
    log(`[verify-bindings] Check 4/5: Access Application AUD matches CF_ACCESS_AUD: PASSED (${cfAccessAud})`);
  } else {
    log(`[verify-bindings] Check 4/5: Access Application AUD matches CF_ACCESS_AUD: PASSED (CF_ACCESS_AUD validated from environment; not hardcoded in wrangler.jsonc)`);
  }
  log(`[verify-bindings] Check 5/5: Access dev-bypass guard (ENABLE_ACCESS_DEV_BYPASS): PASSED (disabled)`);
  log(`[verify-bindings] Production isolation guard: PASSED (no bindings point at env.production)`);
  log(`[verify-bindings] All staging pre-flight checks PASSED successfully.`);

  return {
    success: true,
    accountId: cloudflareAccountId,
    d1DatabaseId: stagingD1DbId,
    r2BucketName: stagingR2BucketName,
    accessTeamDomain: cfAccessTeamDomain,
    accessAud: cfAccessAud,
    configuredAud: configuredAud ?? null,
    devBypass: false,
    dryRun,
  };
}

function parseCliArgs(args) {
  const options = {
    configPath: path.resolve(process.cwd(), 'wrangler.jsonc'),
    envName: 'staging',
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      options.configPath = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--env' && args[i + 1]) {
      options.envName = args[++i];
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node scripts/build/verify-bindings.mjs [options]

Options:
  --config <path>   Path to wrangler.jsonc (default: ./wrangler.jsonc)
  --env <name>      Target environment (default: staging)
  --dry-run         Run verification in dry-run mode
  --help, -h        Show this help message
`);
      process.exit(0);
    }
  }
  return options;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    verifyBindings(options);
  } catch (err) {
    if (err instanceof BindingVerificationError) {
      console.error(`[verify-bindings] FAILED [${err.checkName}]: ${err.message}`);
    } else {
      console.error(`[verify-bindings] UNEXPECTED ERROR:`, err);
    }
    process.exit(1);
  }
}
