// ── Semver version utilities for Soroban contract upgrades ──────────────────
// Provides parsing, comparison, compatibility checking, and a migration
// compatibility matrix for InvoFi's on-chain contract versions.

/**
 * Parsed semantic version.
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Optional pre-release tag, e.g. "beta.1". */
  prerelease?: string;
}

/**
 * A versioned contract identifier.
 */
export interface VersionedContract {
  /** Contract address on Stellar. */
  contractId: string;
  /** The semver string currently deployed on-chain. */
  version: string;
}

/**
 * Describes the compatibility status between two versions.
 */
export type CompatibilityStatus =
  | 'compatible'      // Same major — safe to use
  | 'minor-update'    // Same major, higher minor — backward-compatible
  | 'major-update'    // Different major — breaking changes likely
  | 'downgrade';      // Target version is older than source

/**
 * A single entry in the compatibility matrix.
 */
export interface CompatibilityEntry {
  from: string;
  to: string;
  status: CompatibilityStatus;
  migrationRequired: boolean;
  description: string;
}

/**
 * A single migration step.
 */
export interface MigrationStep {
  /** Execution order (1-indexed). */
  order: number;
  /** Type of migration step. */
  type: 'pre-check' | 'migration' | 'upgrade' | 'post-check';
  /** Human-readable description of the step. */
  description: string;
  /** Whether this step is mandatory. */
  required: boolean;
  /** Estimated wall-clock time for this step. */
  estimatedDuration: string;
}

/**
 * A complete migration plan between two versions.
 */
export interface MigrationPlan {
  /** Version being migrated from. */
  from: string;
  /** Version being migrated to. */
  to: string;
  /** Ordered list of migration steps. */
  steps: MigrationStep[];
  /** Rollback plan if this migration fails. */
  rollbackPlan: RollbackPlan;
}

/**
 * A rollback plan to revert to a previous version.
 */
export interface RollbackPlan {
  /** Current (failed) version to roll back from. */
  from: string;
  /** Previous version to roll back to. */
  to: string;
  /** Ordered rollback steps. */
  steps: MigrationStep[];
}

/**
 * The full compatibility matrix — a static lookup for known version pairs.
 * For unknown pairs we fall back to SemVer-based heuristics.
 */
export const COMPATIBILITY_MATRIX: CompatibilityEntry[] = [
  {
    from: '0.1.0',
    to: '0.2.0',
    status: 'minor-update',
    migrationRequired: false,
    description: 'Added position-token trustline support. No breaking changes.',
  },
  {
    from: '0.2.0',
    to: '0.3.0',
    status: 'minor-update',
    migrationRequired: false,
    description: 'Added overdue marking and reclaim. Backward-compatible.',
  },
  {
    from: '0.3.0',
    to: '1.0.0',
    status: 'major-update',
    migrationRequired: true,
    description: 'Stable release. Storage layout change for invoice status encoding.',
  },
];

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a semver string into its components.
 * Accepts: `MAJOR.MINOR.PATCH`, `MAJOR.MINOR.PATCH-prerelease`
 * @throws on invalid format
 */
export function parseSemVer(version: string): SemVer {
  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?$/,
  );
  if (!match) {
    throw new Error(`Invalid semver string: "${version}" (expected MAJOR.MINOR.PATCH[-prerelease])`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

/**
 * Serialize a SemVer back to a string.
 */
export function serializeSemVer(v: SemVer): string {
  let s = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) s += `-${v.prerelease}`;
  return s;
}

// ── Comparison ──────────────────────────────────────────────────────────────

/**
 * Compare two semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);

  // Compare major, minor, patch
  for (const key of ['major', 'minor', 'patch'] as const) {
    const diff = va[key] - vb[key];
    if (diff !== 0) return diff;
  }

  // Pre-release versions have lower precedence than the same version without
  // (e.g., 1.0.0-beta < 1.0.0).
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && vb.prerelease) {
    return va.prerelease.localeCompare(vb.prerelease);
  }

  return 0;
}

/**
 * Returns true if `target` is a newer version than `current`.
 */
export function isNewerVersion(current: string, target: string): boolean {
  return compareVersions(target, current) > 0;
}

/**
 * Returns true if `target` is a major version bump from `current`.
 */
export function isMajorUpgrade(current: string, target: string): boolean {
  const a = parseSemVer(current);
  const b = parseSemVer(target);
  return a.major !== b.major;
}

// ── Compatibility ───────────────────────────────────────────────────────────

/**
 * Determine the compatibility status between two versions.
 */
export function getCompatibilityStatus(from: string, to: string): CompatibilityStatus {
  // Check the static matrix first
  const entry = COMPATIBILITY_MATRIX.find(e => e.from === from && e.to === to);
  if (entry) return entry.status;

  // Fall back to SemVer heuristics
  const a = parseSemVer(from);
  const b = parseSemVer(to);

  if (a.major > b.major || (a.major === b.major && a.minor > b.minor)) {
    return 'downgrade';
  }
  if (a.major === b.major && a.minor === b.minor) {
    return 'compatible';
  }
  if (a.major === b.major) {
    return 'minor-update';
  }
  return 'major-update';
}

/**
 * Check if two versions are within the same major release (compatible).
 * Useful for the SDK to determine if a client can safely talk to a contract.
 */
export function areVersionsCompatible(a: string, b: string): boolean {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);
  return va.major === vb.major;
}

/**
 * Look up a compatibility entry from the matrix, or synthesize one from SemVer
 * heuristics when the pair isn't in the static table.
 */
export function lookupCompatibility(from: string, to: string): CompatibilityEntry {
  const exact = COMPATIBILITY_MATRIX.find(e => e.from === from && e.to === to);
  if (exact) return exact;

  const status = getCompatibilityStatus(from, to);
  const migrationRequired = status === 'major-update';

  const descriptions: Record<CompatibilityStatus, string> = {
    compatible: 'Same major version — no migration required.',
    'minor-update': 'Same major version — backward-compatible changes.',
    'major-update': 'Major version change — breaking changes likely; migration required.',
    downgrade: `Target version ${to} is older than current ${from}.`,
  };

  return { from, to, status, migrationRequired, description: descriptions[status] };
}
