// ── Soroban contract upgrade client ─────────────────────────────────────────
// Handles version detection, migration planning, rollback support, and
// upgrade notifications for InvoFi's Soroban contracts.
//
// Usage:
//   import { createUpgradeClient } from '@invofi/sdk';
//   const upgrade = createUpgradeClient(cfg);
//   const detected = await upgrade.detectVersion(cfg.registryId);
//   const plan = upgrade.planMigration(detected.version, cfg.expectedVersion);

import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { InvofiClientConfig } from './config';
import {
  type SemVer,
  type VersionedContract,
  type CompatibilityStatus,
  type MigrationStep,
  type MigrationPlan,
  type RollbackPlan,
  parseSemVer,
  serializeSemVer,
  isNewerVersion,
  isMajorUpgrade,
  lookupCompatibility,
} from './version';

const BASE_FEE = '100';

/** The well-known storage key used to store the contract version. */
const VERSION_STORAGE_KEY = '__version';

// ── Public types ────────────────────────────────────────────────────────────

export type { MigrationStep, MigrationPlan, RollbackPlan } from './version';

/**
 * Result of a version detection call.
 */
export interface DetectedVersion {
  /** The contract address. */
  contractId: string;
  /** The on-chain version string (e.g. "0.3.0"). */
  version: string;
  /** Parsed semver components. */
  parsed: SemVer;
  /** Whether detection succeeded without errors. */
  detected: boolean;
  /** Error message if detection failed. */
  error?: string;
}

/**
 * An upgrade notification for UI consumption.
 */
export interface UpgradeNotification {
  /** Contract that has an available upgrade. */
  contractId: string;
  /** Current on-chain version. */
  currentVersion: string;
  /** Recommended version to upgrade to. */
  targetVersion: string;
  /** Severity of the upgrade. */
  severity: 'info' | 'warning' | 'critical';
  /** Human-readable message. */
  message: string;
  /** Whether this is a breaking (major) upgrade. */
  isBreaking: boolean;
  /** Timestamp when the notification was created. */
  createdAt: number;
}

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Create an upgrade client for Soroban contracts.
 *
 * The client provides:
 * 1. **Version detection** — reads the `__version` storage key from a contract.
 * 2. **Migration planning** — generates a step-by-step migration plan.
 * 3. **Rollback support** — provides a rollback plan if an upgrade fails.
 * 4. **Upgrade notifications** — generates UI-friendly notifications.
 */
export function createUpgradeClient(cfg: InvofiClientConfig) {
  const server = () => new SorobanRpc.Server(cfg.rpcUrl, { allowHttp: false });

  /**
   * Read the `__version` storage key from a deployed contract via
   * simulateTransaction. Returns a DetectedVersion with the on-chain version.
   */
  async function detectVersion(
    contractId: string,
    sourceAccount?: string,
  ): Promise<DetectedVersion> {
    try {
      const rpc = server();

      // Use the default read account if none provided.
      // For production use, callers should pass their wallet address.
      const readSource = sourceAccount ?? cfg.rpcUrl.includes('testnet')
        ? undefined
        : undefined;

      // Build a read-only call to the contract's `__version` storage.
      // Soroban contracts store version in a well-known storage key.
      // We use a simulateTransaction call to read it without submitting.
      const readAccount = sourceAccount
        ? await rpc.getAccount(sourceAccount)
        : await getOrCreateReadAccount(rpc);

      const contract = new Contract(contractId);

      // Try reading the version via a direct storage read.
      // Soroban allows reading storage keys via the SorobanRpc API.
      const tx = new TransactionBuilder(readAccount, {
        fee: BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
      })
        .addOperation(contract.call('version', ...encodeVersionReadKey()))
        .setTimeout(30)
        .build();

      const sim = await rpc.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(sim)) {
        // Contract may not expose a `version()` method; try raw storage.
        return await detectVersionFromStorage(contractId, rpc, sourceAccount);
      }

      if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
        return {
          contractId,
          version: '',
          parsed: { major: 0, minor: 0, patch: 0 },
          detected: false,
          error: 'Simulation returned no result',
        };
      }

      const rawVersion = scValToNative(sim.result.retval);
      const versionStr = typeof rawVersion === 'string' ? rawVersion : String(rawVersion);

      return {
        contractId,
        version: versionStr,
        parsed: parseSemVer(versionStr),
        detected: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        contractId,
        version: '',
        parsed: { major: 0, minor: 0, patch: 0 },
        detected: false,
        error: msg,
      };
    }
  }

  /**
   * Fallback: try to read the raw `__version` storage key via the RPC.
   * Soroban exposes `getContractData` for reading arbitrary storage.
   */
  async function detectVersionFromStorage(
    contractId: string,
    rpc: SorobanRpc.Server,
    sourceAccount?: string,
  ): Promise<DetectedVersion> {
    try {
      // Build a storage key for `__version`.
      // In Soroban, contract storage keys use a combination of
      // Space/Contract data with the symbol `__version`.
      const readAccount = sourceAccount
        ? await rpc.getAccount(sourceAccount)
        : await getOrCreateReadAccount(rpc);

      const contract = new Contract(contractId);

      // Attempt to call a hypothetical `get_version` or read via
      // simulate with the raw key. This is a best-effort approach.
      const tx = new TransactionBuilder(readAccount, {
        fee: BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
      })
        .addOperation(contract.call('get_version'))
        .setTimeout(30)
        .build();

      const sim = await rpc.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(sim) || !SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
        return {
          contractId,
          version: '',
          parsed: { major: 0, minor: 0, patch: 0 },
          detected: false,
          error: 'Could not read contract version: no compatible method found',
        };
      }

      const rawVersion = scValToNative(sim.result.retval);
      const versionStr = typeof rawVersion === 'string' ? rawVersion : String(rawVersion);

      return {
        contractId,
        version: versionStr,
        parsed: parseSemVer(versionStr),
        detected: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        contractId,
        version: '',
        parsed: { major: 0, minor: 0, patch: 0 },
        detected: false,
        error: msg,
      };
    }
  }

  /**
   * Ensure we have a readable account for simulation. On testnet this
   * can be funded via Friendbot; on mainnet we need a real account.
   */
  async function getOrCreateReadAccount(rpc: SorobanRpc.Server) {
    // Use a well-known testnet account or the user's account.
    // The RPC will fund it automatically if on testnet.
    const testAccount = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
    try {
      return await rpc.getAccount(testAccount);
    } catch {
      // If account doesn't exist, we'll let the caller handle it.
      throw new Error(
        'Could not create read account. Pass a sourceAccount parameter (e.g. your wallet address) for production use.',
      );
    }
  }

  /**
   * Plan a migration between two versions.
   * Generates ordered steps that must be executed to upgrade safely.
   */
  function planMigration(
    currentVersion: string,
    targetVersion: string,
    contractId?: string,
  ): MigrationPlan {
    const compatibility = lookupCompatibility(currentVersion, targetVersion);
    const steps: MigrationStep[] = [];

    if (compatibility.status === 'downgrade') {
      // Downgrade — use rollback path instead.
      return {
        from: currentVersion,
        to: targetVersion,
        steps: [],
        rollbackPlan: planRollback(contractId ?? '', targetVersion, currentVersion),
      };
    }

    if (compatibility.status === 'compatible') {
      // Same major — direct upgrade, no migration needed.
      steps.push({
        order: 1,
        type: 'upgrade',
        description: `Direct upgrade from ${currentVersion} to ${targetVersion} (same major version)`,
        required: true,
        estimatedDuration: '1-2 minutes',
      });
    }

    if (compatibility.status === 'minor-update') {
      // Same major — backward-compatible, optional migration steps.
      steps.push({
        order: 1,
        type: 'pre-check',
        description: 'Verify on-chain storage compatibility',
        required: true,
        estimatedDuration: '< 1 minute',
      });
      steps.push({
        order: 2,
        type: 'upgrade',
        description: `Deploy new WASM for ${targetVersion}`,
        required: true,
        estimatedDuration: '2-3 minutes',
      });
      steps.push({
        order: 3,
        type: 'post-check',
        description: 'Verify contract state after upgrade',
        required: true,
        estimatedDuration: '< 1 minute',
      });
    }

    if (compatibility.status === 'major-update') {
      // Breaking changes — full migration sequence required.
      steps.push({
        order: 1,
        type: 'pre-check',
        description: `Snapshot current storage for ${currentVersion}`,
        required: true,
        estimatedDuration: '1-2 minutes',
      });
      steps.push({
        order: 2,
        type: 'migration',
        description: 'Run storage migration (if storage layout changed)',
        required: true,
        estimatedDuration: '3-5 minutes',
      });
      steps.push({
        order: 3,
        type: 'upgrade',
        description: `Deploy new WASM for ${targetVersion}`,
        required: true,
        estimatedDuration: '2-3 minutes',
      });
      steps.push({
        order: 4,
        type: 'post-check',
        description: 'Verify migrated data and contract state',
        required: true,
        estimatedDuration: '1-2 minutes',
      });
      steps.push({
        order: 5,
        type: 'post-check',
        description: 'Run integration smoke tests',
        required: true,
        estimatedDuration: '2-3 minutes',
      });
    }

    return {
      from: currentVersion,
      to: targetVersion,
      steps,
      rollbackPlan: planRollback(contractId ?? '', currentVersion, targetVersion),
    };
  }

  /**
   * Plan a rollback to a previous version.
   */
  function planRollback(
    contractId: string,
    currentVersion: string,
    targetVersion: string,
  ): RollbackPlan {
    const steps: MigrationStep[] = [
      {
        order: 1,
        type: 'pre-check',
        description: `Verify WASM for ${targetVersion} is available`,
        required: true,
        estimatedDuration: '< 1 minute',
      },
      {
        order: 2,
        type: 'upgrade',
        description: `Re-deploy previous WASM (${targetVersion}) to contract ${contractId}`,
        required: true,
        estimatedDuration: '2-3 minutes',
      },
      {
        order: 3,
        type: 'migration',
        description: 'Restore storage snapshot from before the failed upgrade',
        required: true,
        estimatedDuration: '1-3 minutes',
      },
      {
        order: 4,
        type: 'post-check',
        description: `Verify contract is operational at version ${targetVersion}`,
        required: true,
        estimatedDuration: '< 1 minute',
      },
    ];

    return {
      from: currentVersion,
      to: targetVersion,
      steps,
    };
  }

  /**
   * Generate upgrade notifications for a list of versioned contracts.
   * Useful for showing upgrade banners in the UI.
   */
  function generateNotifications(
    contracts: VersionedContract[],
    expectedVersions: Record<string, string>,
  ): UpgradeNotification[] {
    const notifications: UpgradeNotification[] = [];

    for (const contract of contracts) {
      const expected = expectedVersions[contract.contractId];
      if (!expected) continue;

      if (contract.version === expected) continue; // Up to date

      const isBreaking = isMajorUpgrade(contract.version, expected);
      const compatibility = lookupCompatibility(contract.version, expected);

      let severity: 'info' | 'warning' | 'critical';
      if (isBreaking) {
        severity = 'critical';
      } else if (compatibility.status === 'minor-update') {
        severity = 'info';
      } else {
        severity = 'warning';
      }

      notifications.push({
        contractId: contract.contractId,
        currentVersion: contract.version,
        targetVersion: expected,
        severity,
        message: isBreaking
          ? `Breaking upgrade available: ${contract.version} → ${expected}. Migration required.`
          : `Upgrade available: ${contract.version} → ${expected}. Safe to upgrade.`,
        isBreaking,
        createdAt: Date.now(),
      });
    }

    return notifications;
  }

  /**
   * Detect versions for all protocol contracts and return an array of
   * VersionedContract objects.
   */
  async function detectAllVersions(
    sourceAccount?: string,
  ): Promise<VersionedContract[]> {
    const contracts = [
      { id: cfg.registryId, name: 'registry' },
      { id: cfg.financingId, name: 'financing' },
      { id: cfg.repaymentId, name: 'repayment' },
    ];

    const results: VersionedContract[] = [];
    for (const c of contracts) {
      const detected = await detectVersion(c.id, sourceAccount);
      results.push({
        contractId: c.id,
        version: detected.version || '0.0.0',
      });
    }
    return results;
  }

  /**
   * Validate that a target version is safe to upgrade to.
   * Returns { safe, reason, compatibility }.
   */
  function validateUpgradeTarget(
    currentVersion: string,
    targetVersion: string,
  ): { safe: boolean; reason: string; compatibility: CompatibilityStatus } {
    const entry = lookupCompatibility(currentVersion, targetVersion);
    const status = entry.status;

    if (status === 'downgrade') {
      return {
        safe: false,
        reason: `Target version ${targetVersion} is older than current ${currentVersion}. Use rollback instead.`,
        compatibility: status,
      };
    }

    if (status === 'major-update') {
      return {
        safe: false,
        reason: `Major version upgrade detected. This is a breaking change requiring migration. Ensure you have a rollback plan.`,
        compatibility: status,
      };
    }

    if (status === 'minor-update') {
      return {
        safe: true,
        reason: `Backward-compatible upgrade. No migration required.`,
        compatibility: status,
      };
    }

    return {
      safe: true,
      reason: `Same major version — safe to upgrade.`,
      compatibility: status,
    };
  }

  return {
    detectVersion,
    detectAllVersions,
    planMigration,
    planRollback,
    generateNotifications,
    validateUpgradeTarget,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Encode the storage key for the `__version` storage entry.
 * This is used when reading the version from contract storage.
 */
function encodeVersionReadKey(): xdr.ScVal[] {
  return [
    nativeToScVal(VERSION_STORAGE_KEY, { type: 'symbol' }),
  ];
}

export type UpgradeClient = ReturnType<typeof createUpgradeClient>;
