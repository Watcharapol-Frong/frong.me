import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  verifyBindings,
  parseWranglerJsonc,
  BindingVerificationError,
} from '../../scripts/build/verify-bindings.mjs';

const VALID_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'account-staging-001',
  CF_D1_DATABASE_ID: '71cba742-a269-475d-84b0-8df1223a368a',
  CF_R2_BUCKET_NAME: 'portfolio-media-staging',
  CF_ACCESS_AUD: 'test-staging-access-aud',
  CF_ACCESS_TEAM_DOMAIN: 'https://staging.cloudflareaccess.com',
  ENABLE_ACCESS_DEV_BYPASS: 'false',
};

const BASE_WRANGLER_JSONC = `{
  // JSONC comments supported
  "name": "frong-me",
  "compatibility_date": "2026-09-10",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "portfolio-db-staging",
      "database_id": "71cba742-a269-475d-84b0-8df1223a368a",
    }
  ],
  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "portfolio-media-staging",
    }
  ],
  "env": {
    "staging": {
      "name": "frong-me-staging",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "portfolio-db-staging",
          "database_id": "71cba742-a269-475d-84b0-8df1223a368a",
        }
      ],
      "r2_buckets": [
        {
          "binding": "MEDIA_BUCKET",
          "bucket_name": "portfolio-media-staging",
        }
      ]
    },
    "production": {
      "name": "frong-me",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "portfolio-db-production",
          "database_id": "prod-d1-id-12345",
        }
      ],
      "r2_buckets": [
        {
          "binding": "MEDIA_BUCKET",
          "bucket_name": "portfolio-media-production",
        }
      ]
    }
  }
}`;

describe('scripts/build/verify-bindings.mjs', () => {
  it('parses valid JSONC with comments and trailing commas without using JSON.parse', () => {
    const tmpFile = path.resolve('/tmp', `test-wrangler-${Date.now()}.jsonc`);
    fs.writeFileSync(tmpFile, BASE_WRANGLER_JSONC, 'utf8');
    try {
      const parsed = parseWranglerJsonc(tmpFile);
      assert.equal(parsed.name, 'frong-me');
      assert.equal(parsed.env.staging.d1_databases[0].database_id, '71cba742-a269-475d-84b0-8df1223a368a');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('fails loudly on malformed JSONC and never silently passes', () => {
    const tmpFile = path.resolve('/tmp', `bad-wrangler-${Date.now()}.jsonc`);
    fs.writeFileSync(tmpFile, '{\n  "broken": unquoted_value\n', 'utf8');
    try {
      assert.throws(
        () => parseWranglerJsonc(tmpFile),
        (err: any) => err instanceof BindingVerificationError && err.checkName === 'jsonc-syntax'
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('passes all 5 checks in dry-run mode against the workspace wrangler.jsonc', () => {
    const logs: string[] = [];
    const result = verifyBindings({
      configPath: path.resolve(process.cwd(), 'wrangler.jsonc'),
      env: VALID_ENV,
      dryRun: true,
      log: (msg) => logs.push(msg),
    });

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.ok(logs.some((l) => l.includes('Check 1/5: Required SSOT variables are present and non-blank: PASSED')));
    assert.ok(logs.some((l) => l.includes('Check 2/5: D1 database ID matches CF_D1_DATABASE_ID: PASSED')));
    assert.ok(logs.some((l) => l.includes('Check 3/5: R2 bucket name matches CF_R2_BUCKET_NAME: PASSED')));
    assert.ok(logs.some((l) => l.includes('Check 4/5: Access Application AUD matches CF_ACCESS_AUD: PASSED')));
    assert.ok(logs.some((l) => l.includes('Check 5/5: Access dev-bypass guard (ENABLE_ACCESS_DEV_BYPASS): PASSED')));
  });

  it('fails immediately if ENABLE_ACCESS_DEV_BYPASS is set to true under any condition', () => {
    assert.throws(
      () =>
        verifyBindings({
          env: {
            ...VALID_ENV,
            ENABLE_ACCESS_DEV_BYPASS: 'true',
          },
        }),
      (err: any) =>
        err instanceof BindingVerificationError &&
        err.checkName === 'dev-bypass' &&
        err.message.includes('strictly forbidden')
    );

    // Also tests case-insensitivity and "1"
    assert.throws(
      () =>
        verifyBindings({
          env: {
            ...VALID_ENV,
            ENABLE_ACCESS_DEV_BYPASS: 'TRUE',
          },
        }),
      (err: any) => err.checkName === 'dev-bypass'
    );
    assert.throws(
      () =>
        verifyBindings({
          env: {
            ...VALID_ENV,
            ENABLE_ACCESS_DEV_BYPASS: '1',
          },
        }),
      (err: any) => err.checkName === 'dev-bypass'
    );
  });

  it('fails before real deploy if D1 binding mismatches CF_D1_DATABASE_ID', () => {
    assert.throws(
      () =>
        verifyBindings({
          env: {
            ...VALID_ENV,
            CF_D1_DATABASE_ID: 'mismatched-db-id-0000',
          },
        }),
      (err: any) =>
        err instanceof BindingVerificationError &&
        err.checkName === 'd1-binding' &&
        err.message.includes('mismatched-db-id-0000')
    );
  });

  it('fails before real deploy if R2 binding mismatches CF_R2_BUCKET_NAME', () => {
    assert.throws(
      () =>
        verifyBindings({
          env: {
            ...VALID_ENV,
            CF_R2_BUCKET_NAME: 'mismatched-bucket-name',
          },
        }),
      (err: any) =>
        err instanceof BindingVerificationError &&
        err.checkName === 'r2-binding' &&
        err.message.includes('mismatched-bucket-name')
    );
  });

  it('verifies configured Access Application AUD if present in wrangler.jsonc', () => {
    const tmpFile = path.resolve('/tmp', `test-aud-${Date.now()}.jsonc`);
    const withAud = BASE_WRANGLER_JSONC.replace(
      '"name": "frong-me-staging",',
      '"name": "frong-me-staging",\n      "vars": { "CF_ACCESS_AUD": "expected-aud-123" },'
    );
    fs.writeFileSync(tmpFile, withAud, 'utf8');

    try {
      // Passes when env AUD matches configured AUD
      const result = verifyBindings({
        configPath: tmpFile,
        env: {
          ...VALID_ENV,
          CF_ACCESS_AUD: 'expected-aud-123',
        },
      });
      assert.equal(result.configuredAud, 'expected-aud-123');

      // Fails when env AUD mismatches configured AUD
      assert.throws(
        () =>
          verifyBindings({
            configPath: tmpFile,
            env: {
              ...VALID_ENV,
              CF_ACCESS_AUD: 'different-aud-456',
            },
          }),
        (err: any) =>
          err instanceof BindingVerificationError &&
          err.checkName === 'aud-mismatch' &&
          err.message.includes('different-aud-456')
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('fails if any staging binding points at env.production', () => {
    const tmpFile = path.resolve('/tmp', `test-prod-leak-${Date.now()}.jsonc`);
    // Staging D1 database_id points to production database_id
    const withProdLeak = BASE_WRANGLER_JSONC.replaceAll(
      '"database_id": "71cba742-a269-475d-84b0-8df1223a368a"',
      '"database_id": "prod-d1-id-12345"'
    );
    fs.writeFileSync(tmpFile, withProdLeak, 'utf8');

    try {
      assert.throws(
        () =>
          verifyBindings({
            configPath: tmpFile,
            env: {
              ...VALID_ENV,
              CF_D1_DATABASE_ID: 'prod-d1-id-12345',
            },
          }),
        (err: any) =>
          err instanceof BindingVerificationError &&
          err.checkName === 'prod-isolation' &&
          err.message.includes('matches a database in env.production')
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('fails if staging binding names reference production', () => {
    const tmpFile = path.resolve('/tmp', `test-prod-name-${Date.now()}.jsonc`);
    const withProdName = BASE_WRANGLER_JSONC.replaceAll(
      '"database_name": "portfolio-db-staging"',
      '"database_name": "portfolio-db-production"'
    );
    fs.writeFileSync(tmpFile, withProdName, 'utf8');

    try {
      assert.throws(
        () =>
          verifyBindings({
            configPath: tmpFile,
            env: VALID_ENV,
          }),
        (err: any) =>
          err instanceof BindingVerificationError &&
          err.checkName === 'prod-isolation' &&
          err.message.includes('points at production')
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('falls back to legacy account/D1/R2 names when SSOT names are absent', () => {
    const logs: string[] = [];
    const result = verifyBindings({
      configPath: path.resolve(process.cwd(), 'wrangler.jsonc'),
      env: {
        ...VALID_ENV,
        CLOUDFLARE_ACCOUNT_ID: undefined,
        CF_D1_DATABASE_ID: undefined,
        CF_R2_BUCKET_NAME: undefined,
        CF_ACCOUNT_ID: 'account-staging-001',
        STAGING_D1_DATABASE_ID: '71cba742-a269-475d-84b0-8df1223a368a',
        STAGING_R2_BUCKET_NAME: 'portfolio-media-staging',
      },
      dryRun: true,
      log: (msg) => logs.push(msg),
    });

    assert.equal(result.success, true);
    assert.equal(result.accountId, 'account-staging-001');
    assert.equal(result.d1DatabaseId, '71cba742-a269-475d-84b0-8df1223a368a');
    assert.equal(result.r2BucketName, 'portfolio-media-staging');
  });

  it('fails if required environment variables are missing', () => {
    const requiredVars = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CF_D1_DATABASE_ID',
      'CF_R2_BUCKET_NAME',
      'CF_ACCESS_AUD',
      'CF_ACCESS_TEAM_DOMAIN',
    ] as const;

    for (const key of requiredVars) {
      const incompleteEnv = { ...VALID_ENV };
      delete incompleteEnv[key];

      assert.throws(
        () =>
          verifyBindings({
            env: incompleteEnv,
          }),
        (err: any) =>
          err instanceof BindingVerificationError &&
          err.checkName === 'missing-env-var' &&
          err.message.includes(key)
      );
    }
  });

  it('fails fast and names each SSOT variable when it resolves to an empty string or whitespace', () => {
    const requiredVars = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CF_D1_DATABASE_ID',
      'CF_R2_BUCKET_NAME',
      'CF_ACCESS_TEAM_DOMAIN',
      'CF_ACCESS_AUD',
    ] as const;

    for (const [index, key] of requiredVars.entries()) {
      assert.throws(
        () => verifyBindings({
          env: {
            ...VALID_ENV,
            [key]: index % 2 === 0 ? '' : '  \t  ',
          },
        }),
        (err: any) =>
          err instanceof BindingVerificationError
          && err.checkName === 'missing-env-var'
          && err.message.includes(key)
          && err.message.includes('empty string')
      );
    }
  });

  it('does not hide a blank SSOT value behind a populated legacy fallback', () => {
    assert.throws(
      () => verifyBindings({
        env: {
          ...VALID_ENV,
          CF_D1_DATABASE_ID: '   ',
          STAGING_D1_DATABASE_ID: '71cba742-a269-475d-84b0-8df1223a368a',
        },
      }),
      (err: any) =>
        err instanceof BindingVerificationError
        && err.message.includes('CF_D1_DATABASE_ID resolved to an empty string')
    );
  });

  it('fails clearly when the selected legacy fallback is blank', () => {
    assert.throws(
      () => verifyBindings({
        env: {
          ...VALID_ENV,
          CLOUDFLARE_ACCOUNT_ID: undefined,
          CF_ACCOUNT_ID: '   ',
        },
      }),
      (err: any) =>
        err instanceof BindingVerificationError
        && err.message.includes('CLOUDFLARE_ACCOUNT_ID')
        && err.message.includes('legacy fallback CF_ACCOUNT_ID resolved to an empty string')
    );
  });
});
