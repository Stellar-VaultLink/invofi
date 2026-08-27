#!/usr/bin/env node
/**
 * Bundle-size budget check for the invofi frontend (GrantFox issue #108).
 *
 * Parses the per-route size table that `next build` prints to stdout and
 * compares every route's "First Load JS" against a committed baseline
 * (bundle-budget.json). Any route that grows past `(1 + threshold)` times its
 * committed budget fails the check, so bundle bloat is caught in CI / on push.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs [--log <build-log>] [--update] [--budget <file>]
 *
 *   --log <file>   Read build output from <file> instead of stdin.
 *   --update       Regenerate bundle-budget.json from the current build output.
 *                  Use deliberately (e.g. when a feature legitimately adds JS).
 *   --budget       Path to the budget file (default: scripts/bundle-budget.json).
 *
 * Exit codes: 0 = within budget, 1 = a route exceeded its budget, 2 = usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUDGET = path.join(__dirname, 'bundle-budget.json');
const THRESHOLD = 0.1; // 10 % headroom over the committed budget

function parseArgs(argv) {
  const args = { log: null, update: false, budget: DEFAULT_BUDGET };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--log') args.log = argv[i + 1];
    else if (argv[i] === '--update') args.update = true;
    else if (argv[i] === '--budget') args.budget = argv[i + 1];
  }
  return args;
}

/**
 * Parse the "Route (app) … Size … First Load JS" table from `next build` output.
 * Returns a Map of routePath -> firstLoadKiB (number).
 */
export function parseBuildTable(output) {
  const rows = new Map();
  const lines = output.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (line.includes('Route (app)') && line.includes('First Load JS')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    // Table ends at the "First Load JS shared by all" separator line.
    if (line.includes('First Load JS shared by all')) break;
    if (!line.trim()) continue;
    if (/^[└├┌]+/.test(line.trim()) === false) continue;

    // e.g. "├ ○ /dashboard   9.83 kB   352 kB"   or  "├ ƒ /invoices/[id]  24.5 kB  392 kB"
    const match = line.match(/^[└├┌]\s+[○ƒ]\s+(\S+)\s+[\d.]+\s+\w+\s+([\d.]+)\s+kB\s*$/);
    if (!match) continue;
    const [, route, firstLoad] = match;
    rows.set(route.replace(/\/$/, '') || '/', Number(firstLoad));
  }
  return rows;
}

function loadBudget(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function formatFileSize(kib) {
  return kib.toFixed(1).padStart(7) + ' kB';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = args.log
    ? fs.readFileSync(args.log, 'utf8')
    : fs.readFileSync(0, 'utf8');

  const current = parseBuildTable(raw);
  if (current.size === 0) {
    console.error('error: could not find the per-route size table in build output.');
    console.error('Is this a Next.js "next build" log?');
    process.exit(2);
  }

  if (args.update) {
    const existing = loadBudget(args.budget);
    const budget = {
      description: 'Per-route First Load JS budgets for the invofi frontend (issue #108).',
      generatedFrom: 'next build',
      threshold: existing?.threshold ?? THRESHOLD,
      routes: Object.fromEntries(
        [...current.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    };
    fs.writeFileSync(args.budget, JSON.stringify(budget, null, 2) + '\n');
    console.log(`Updated ${path.relative(process.cwd(), args.budget)} with ${current.size} routes.`);
    process.exit(0);
  }

  const budget = loadBudget(args.budget);
  if (!budget) {
    console.error(`error: no budget file at ${args.budget}. Run with --update to create it.`);
    process.exit(2);
  }

  const limit = typeof budget.threshold === 'number' ? budget.threshold : THRESHOLD;
  const failures = [];
  const additions = [];
  const removed = [];

  for (const [route, kib] of current) {
    const committed = budget.routes[route];
    if (committed === undefined) {
      additions.push(route);
      continue;
    }
    const ceiling = committed * (1 + limit);
    if (kib > ceiling) {
      failures.push(
        `${route.padEnd(28)} ${formatFileSize(kib)}  budget ${formatFileSize(committed)} (+${((kib / committed - 1) * 100).toFixed(1)} %)`,
      );
    }
  }

  for (const route of Object.keys(budget.routes)) {
    if (!current.has(route)) removed.push(route);
  }

  let ok = true;
  if (failures.length) {
    ok = false;
    console.error('Bundle budget exceeded for:');
    for (const line of failures) console.error('  ' + line);
  }
  if (additions.length) {
    console.error(`New routes with no committed budget (rerun --update deliberately):`);
    for (const r of additions) console.error('  ' + r);
  }
  if (removed.length) {
    console.error(`Routes removed since the budget was written (rerun --update to clean):`);
    for (const r of removed) console.error('  ' + r);
  }
  if (ok) {
    console.log(`Bundle budget OK (${current.size} routes, ${limit * 100} % headroom).`);
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}