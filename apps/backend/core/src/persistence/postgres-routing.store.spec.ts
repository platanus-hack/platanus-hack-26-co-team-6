import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresRoutingStore } from './postgres-routing.store';

const url = process.env.PULSO_TEST_DATABASE_URL;
const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/0002_pulso_safety_kernel.sql',
);
const migration = () => readFileSync(migrationPath, 'utf8');
const pauseFirstCaseWrite = (pool: Pool) =>
  pool.query(`
    create function pulso_pause_case_insert() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.15); return new; end;
    $$;
    create trigger pulso_pause_case_insert before insert on pulso_routing_cases
    for each row execute function pulso_pause_case_insert();
  `);
const evidence = (
  caseId: string,
  destinationCode: string,
  modelVersion = 'v1',
) => ({
  caseId,
  modelVersion,
  configVersion: 'c1',
  inputs: {},
  candidates: [],
  selectedDestination: destinationCode,
  etaProvenance: 'mapbox' as const,
  minuteBreakdown: { route: 1 },
  fingerprint: `${caseId}-${destinationCode}`,
});
const command = (
  caseId: string,
  destinationCode: string,
  requestKey: string,
  fingerprint = requestKey,
  modelVersion = 'v1',
) => ({
  caseId,
  destinationCode,
  requestKey,
  fingerprint,
  evidence: evidence(caseId, destinationCode, modelVersion),
});

describe('PostgreSQL routing store', () => {
  let pool: Pool;

  beforeAll(async () => {
    const parsed = url && new URL(url);
    if (
      !parsed ||
      parsed.hostname !== 'localhost' ||
      parsed.port !== '55432' ||
      parsed.pathname !== '/pulso_test'
    )
      throw new Error(
        'PULSO_TEST_DATABASE_URL must target the disposable pulso_test database',
      );
    pool = new Pool({ connectionString: url });
    const database = await pool.query<{ current_database: string }>(
      'select current_database()',
    );
    if (database.rows[0].current_database !== 'pulso_test')
      throw new Error('refusing to mutate a non-test database');
  });

  beforeEach(async () => {
    await pool.query('drop schema public cascade; create schema public');
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('drop schema public cascade; create schema public');
      await pool.end();
    }
  });

  it('rolls back a failed audit, applies the migration, and replays the same request exactly once', async () => {
    const migrationClient = await pool.connect();
    try {
      await migrationClient.query('begin');
      await migrationClient.query(migration());
      await migrationClient.query('rollback');
    } finally {
      migrationClient.release();
    }
    await expect(
      pool.query(
        "select to_regclass('public.pulso_routing_cases') as relation",
      ),
    ).resolves.toMatchObject({ rows: [{ relation: null }] });

    await pool.query(migration());
    const store = new PostgresRoutingStore(pool);
    await expect(
      store.respond(
        command('rollback-case', 'A', 'rollback-key', 'rollback-key', ''),
      ),
    ).rejects.toThrow();
    await expect(
      pool.query('select * from pulso_routing_cases where case_id = $1', [
        'rollback-case',
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      store.respond(command('case-1', 'A', 'key-1')),
    ).resolves.toEqual({ accepted: true });
    await expect(
      store.respond(command('case-1', 'A', 'key-1')),
    ).resolves.toEqual({ accepted: true });
    await expect(store.audit()).resolves.toHaveLength(1);
    await expect(
      pool.query('delete from pulso_routing_decision_audit'),
    ).rejects.toThrow('append-only');
    await expect(
      pool.query('truncate pulso_routing_decision_audit'),
    ).rejects.toThrow('append-only');
  });

  it('rejects an idempotency fingerprint conflict without adding an audit event', async () => {
    await pool.query(migration());
    const store = new PostgresRoutingStore(pool);
    await store.respond(command('case-1', 'A', 'key-1'));
    await expect(
      store.respond(command('case-1', 'A', 'key-1', 'different')),
    ).resolves.toMatchObject({
      accepted: false,
      error: { error: { code: 'PULSO_IDEMPOTENCY_CONFLICT' } },
    });
    await expect(store.audit()).resolves.toHaveLength(1);
  });

  it('allows exactly one competing destination across two PostgreSQL clients', async () => {
    await pool.query(migration());
    const secondPool = new Pool({ connectionString: url });
    const first = new PostgresRoutingStore(pool);
    const second = new PostgresRoutingStore(secondPool);
    try {
      const results = await Promise.all([
        first.respond(command('case-1', 'A', 'key-1')),
        second.respond(command('case-1', 'B', 'key-2')),
      ]);
      expect(results.filter((result) => result.accepted)).toHaveLength(1);
      expect(results.find((result) => !result.accepted)).toMatchObject({
        error: { error: { code: 'PULSO_DESTINATION_ALREADY_ACCEPTED' } },
      });
      await expect(first.audit()).resolves.toHaveLength(1);
    } finally {
      await secondPool.end();
    }
  });

  it('replays concurrent identical idempotency keys without duplicate effects', async () => {
    await pool.query(migration());
    await pauseFirstCaseWrite(pool);
    const secondPool = new Pool({ connectionString: url });
    try {
      const results = await Promise.all([
        new PostgresRoutingStore(pool).respond(command('case-1', 'A', 'key-1')),
        new PostgresRoutingStore(secondPool).respond(
          command('case-1', 'A', 'key-1'),
        ),
      ]);
      expect(results).toEqual([{ accepted: true }, { accepted: true }]);
      await expect(
        new PostgresRoutingStore(pool).audit(),
      ).resolves.toHaveLength(1);
    } finally {
      await secondPool.end();
    }
  });

  it('returns a conflict for concurrent same-key fingerprint mismatches', async () => {
    await pool.query(migration());
    await pauseFirstCaseWrite(pool);
    const secondPool = new Pool({ connectionString: url });
    try {
      const results = await Promise.all([
        new PostgresRoutingStore(pool).respond(command('case-1', 'A', 'key-1')),
        new PostgresRoutingStore(secondPool).respond(
          command('case-1', 'A', 'key-1', 'different'),
        ),
      ]);
      expect(results.filter((result) => result.accepted)).toHaveLength(1);
      expect(results.find((result) => !result.accepted)).toMatchObject({
        error: { error: { code: 'PULSO_IDEMPOTENCY_CONFLICT' } },
      });
      await expect(
        new PostgresRoutingStore(pool).audit(),
      ).resolves.toHaveLength(1);
    } finally {
      await secondPool.end();
    }
  });
});
