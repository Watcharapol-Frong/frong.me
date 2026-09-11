#!/usr/bin/env node

/**
 * Staging deploy helper script for Cloudflare Workers.
 *
 * 1. Runs pre-flight verification via verifyBindings()
 * 2. Builds application targeting staging (CLOUDFLARE_ENV=staging)
 * 3. Executes `wrangler deploy --env staging` (or with `--dry-run`)
 * 4. Logs deploy result (URL, deployment ID) to `.wrangler/deploy-result/deployment-result.json`
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyBindings } from './verify-bindings.mjs';

function parseArgs(args) {
  const options = {
    dryRun: false,
    configPath: path.resolve(process.cwd(), 'wrangler.jsonc'),
    outputDir: path.resolve(process.cwd(), '.wrangler/deploy-result'),
    skipBuild: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--config' && args[i + 1]) {
      options.configPath = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      options.outputDir = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--skip-build') {
      options.skipBuild = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node scripts/build/deploy-staging.mjs [options]

Options:
  --dry-run       Simulate deploy with wrangler --dry-run (skips real deploy)
  --config <path> Path to wrangler.jsonc (default: ./wrangler.jsonc)
  --output-dir    Directory to save deploy result artifacts (default: ./.wrangler/deploy-result)
  --skip-build    Skip astro build step (uses existing dist)
  --help, -h      Show this message
`);
      process.exit(0);
    }
  }

  return options;
}

export function deployStaging(options = {}) {
  const {
    dryRun = false,
    configPath = path.resolve(process.cwd(), 'wrangler.jsonc'),
    outputDir = path.resolve(process.cwd(), '.wrangler/deploy-result'),
    skipBuild = false,
    env = process.env,
    log = console.log,
  } = options;

  log('=== [deploy-staging] Step 1: Pre-flight binding verification ===');
  const verification = verifyBindings({
    configPath,
    envName: 'staging',
    env,
    dryRun,
    log,
  });

  if (!verification.success) {
    throw new Error('Pre-flight verification failed');
  }

  if (!skipBuild) {
    log('\n=== [deploy-staging] Step 2: Building application for staging ===');
    const buildResult = spawnSync('npm', ['run', 'build'], {
      stdio: 'inherit',
      env: {
        ...env,
        CLOUDFLARE_ENV: 'staging',
      },
    });
    if (buildResult.status !== 0) {
      throw new Error(`Astro build failed with exit code ${buildResult.status}`);
    }
  } else {
    log('\n=== [deploy-staging] Step 2: Skipped build (--skip-build specified) ===');
  }

  log('\n=== [deploy-staging] Step 3: Deploying targeting env.staging ===');
  fs.mkdirSync(outputDir, { recursive: true });

  const wranglerArgs = ['wrangler', 'deploy', '--env', 'staging'];
  if (dryRun) {
    wranglerArgs.push('--dry-run', '--outdir', path.resolve(process.cwd(), '.wrangler/dry-run'));
  }

  log(`[deploy-staging] Running: npx ${wranglerArgs.join(' ')}`);
  const deployProcess = spawnSync('npx', wranglerArgs, {
    encoding: 'utf8',
    env,
  });

  const output = (deployProcess.stdout || '') + (deployProcess.stderr || '');
  log(output);

  if (deployProcess.status !== 0) {
    fs.writeFileSync(path.join(outputDir, 'deploy-error.log'), output, 'utf8');
    throw new Error(`Wrangler deploy failed with exit code ${deployProcess.status}`);
  }

  // Parse deployment details
  let deployUrl = 'https://cms-staging.frong.me';
  let deploymentId = dryRun ? `dry-run-${Date.now()}` : 'unknown-id';

  const urlMatch = output.match(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev|https:\/\/cms-staging\.frong\.me/);
  if (urlMatch) {
    deployUrl = urlMatch[0];
  }

  const idMatch = output.match(/(?:Current Deployment ID|Deployment ID):\s*([a-f0-9-]+)/i);
  if (idMatch && idMatch[1]) {
    deploymentId = idMatch[1];
  }

  const deployResult = {
    environment: 'staging',
    mode: dryRun ? 'dry-run' : 'live',
    url: deployUrl,
    deploymentId,
    timestamp: new Date().toISOString(),
    d1DatabaseId: verification.d1DatabaseId,
    r2BucketName: verification.r2BucketName,
    success: true,
  };

  const resultFilePath = path.join(outputDir, 'deployment-result.json');
  fs.writeFileSync(resultFilePath, JSON.stringify(deployResult, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'wrangler-deploy.log'), output, 'utf8');

  log('\n=== [deploy-staging] Step 4: Deploy result artifact saved ===');
  log(`Artifact location: ${resultFilePath}`);
  log(`Deploy URL: ${deployResult.url}`);
  log(`Deployment ID: ${deployResult.deploymentId}`);
  log(`Mode: ${deployResult.mode}`);

  return deployResult;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    deployStaging(opts);
  } catch (err) {
    console.error(`\n[deploy-staging] Deployment failed: ${err.message}`);
    process.exit(1);
  }
}

