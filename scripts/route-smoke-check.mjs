#!/usr/bin/env node
/**
 * Route smoke check for the invofi frontend (GrantFox issue #108).
 *
 * Boots the production Next.js server and requests every page route,
 * failing on any response >= 500 (a route that throws at runtime).
 *
 * Usage:
 *   node scripts/route-smoke-check.mjs [--port 3000] [--timeout 30000]
 *
 * The list of routes to check is derived from `next build` output passed on
 * stdin (pipe the build log in), or falls back to the committed route list in
 * scripts/bundle-budget.json (routes with a committed First Load JS budget).
 *
 * Exit codes: 0 = all routes healthy, 1 = a route returned >= 500 or was
 * unreachable, 2 = usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_FILE = path.join(__dirname, 'bundle-budget.json');

function parseArgs(argv) {
  const args = { port: 3000, timeoutMs: 45000 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') args.port = Number(argv[i + 1]);
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[i + 1]);
  }
  return args;
}

/** Derive route list: stdin build table first, budget file as fallback. */
function collectRoutes(raw) {
  const routes = new Set();
  if (raw && raw.includes('Route (app)')) {
    // Same format as check-bundle-budget: "├ ○ /dashboard   9.83 kB   352 kB"
    for (const line of raw.split('\n')) {
      const match = line.match(/^[└├┌]\s+[○ƒ]\s+(\S+)/);
      if (match) routes.add(match[1]);
    }
  } else if (fs.existsSync(BUDGET_FILE)) {
    const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    for (const route of Object.keys(budget.routes || {})) routes.add(route);
  }

  // Drop non-page / infra routes that must not 200 (API 405s, asset icons,
  // sitemap/robots 200s, and internal Next error pages).
  const skip = new Set([
    '/_error', '/_not-found', '/404', '/500', '/60x',
    '/api/auth/sep10/challenge', '/api/auth/sep10/verify',
    '/api/documents/upload', '/api/documents/[id]/content',
    '/apple-icon.png', '/icon.png', '/favicon.ico', '/robots.txt', '/sitemap.xml',
  ]);
  const out = [];
  for (const r of routes) {
    if (skip.has(r)) continue;
    // Dynamic route segments (named, catch-all) get a placeholder value so the
    // smoke check exercises a real path instead of the literal bracket text.
    out.push(r.replace(/\[[^\]]+\]/g, 'smoke-test'));
  }
  return [...new Set(out)].sort();
}

function request(port, route, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: route, method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume(); // drain so the socket can be reused
        res.on('end', () => resolve({ route, status: res.statusCode }));
      },
    );
    req.on('error', (err) => reject({ route, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      reject({ route, error: 'timeout' });
    });
    req.end();
  });
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.request({ host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 3000 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`server did not become ready on port ${port} within ${timeoutMs} ms`));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() > deadline) reject(new Error('server ready timeout'));
        else setTimeout(tryOnce, 500);
      });
      req.end();
    };
    tryOnce();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = fs.existsSync(0) ? fs.readFileSync(0, 'utf8') : '';
  const routes = collectRoutes(raw);
  if (routes.length === 0) {
    console.error('error: no routes to check. Pipe a next build log or commit a budget file.');
    process.exit(2);
  }

  const server = spawn('npx', ['next', 'start', '-p', String(args.port)], {
    cwd: path.join(__dirname, '..', 'invofi', 'apps', 'frontend'),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (d) => { serverOutput += d; });
  server.stderr.on('data', (d) => { serverOutput += d; });

  try {
    await waitForServer(args.port, args.timeoutMs);
  } catch (err) {
    console.error('error: ' + err.message);
    console.error(serverOutput.slice(-2000));
    server.kill('SIGKILL');
    process.exit(1);
  }

  const failures = [];
  const results = [];
  console.log(`Smoke-checking ${routes.length} routes on :${args.port} ...`);
  for (const route of routes) {
    try {
      const r = await request(args.port, route, args.timeoutMs);
      const status = r.status;
      results.push(`${String(status).padStart(3)} ${' '.repeat(2)}${route}`);
      if (status >= 500 || status === 0) failures.push(`${status} ${route}`);
    } catch (err) {
      results.push(`ERR ${' '.repeat(3)}${route}`);
      failures.push(`${err.error || 'error'} ${route}`);
    }
  }

  console.log(results.join('\n'));
  server.kill('SIGTERM');

  if (failures.length) {
    console.error(`\nRoute smoke check FAILED (${failures.length}):`);
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }
  console.log('\nRoute smoke check OK.');
  process.exit(0);
}

main();