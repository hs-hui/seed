import { SEED_VERSION, SeedState, seedSchema } from '../domain.js';

type Migration = (state: unknown) => unknown;

// Register a migration under its source version when the persisted schema
// changes. Migrations transform data only; the store owns file writes.
const migrations: Partial<Record<number, Migration>> = {};

export function migrateSeed(raw: unknown): SeedState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('seed-state-invalid');
  const version = (raw as { version?: unknown }).version;
  if (!Number.isInteger(version) || (version as number) < 1) throw new Error('seed-version-unsupported');
  if ((version as number) > SEED_VERSION) throw new Error(`seed-version-newer:${version}`);

  let state: unknown = raw;
  for (let current = version as number; current < SEED_VERSION; current++) {
    const migrate = migrations[current];
    if (!migrate) throw new Error(`seed-migration-missing:${current}`);
    state = migrate(state);
    if (!state || typeof state !== 'object' || (state as { version?: unknown }).version !== current + 1) {
      throw new Error(`seed-migration-invalid:${current}`);
    }
  }
  return seedSchema.parse(state);
}
