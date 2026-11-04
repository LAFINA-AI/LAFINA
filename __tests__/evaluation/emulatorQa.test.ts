import { spawnSync } from 'node:child_process';
import { db, initDatabase, userStore } from '../../src/storage';
import { createCommandSession } from '../../src/ai/nlu/commandSession';

it('prepares literal emulator fixture titles without treating cancel as an instruction', async () => {
  await initDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',
    ['emulator-qa-contract', 'Synthetic', now, now],
  );
  userStore.setCurrentUser('emulator-qa-contract');
  for (const kind of ['main', 'cancel']) {
    const title = `LAFINA-QA-run01-${kind}`,
      session = createCommandSession('emulator-qa-contract');
    try {
      const result = session.propose(`Add task "${title}"`);
      expect(result.review?.summary).toBe(
        `Create task “${title}”\nNo due date\nNo time or reminder will be invented.`,
      );
    } finally {
      session.dispose();
    }
  }
  expect(
    Number(
      db.executeSync(
        "SELECT count(*) AS n FROM tasks WHERE user_id='emulator-qa-contract'",
      ).rows[0].n,
    ),
  ).toBe(0);
});

it('validates bounded emulator commands, draft protection and fixture ownership without a device', () => {
  const result = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    [
      '-X',
      'utf8',
      '-m',
      'unittest',
      'discover',
      '-s',
      'scripts/tests',
      '-p',
      'test_emulator_qa.py',
    ],
    { encoding: 'utf8', timeout: 20000 },
  );
  expect({
    status: result.status,
    error: result.error?.message,
    output: result.stderr,
  }).toEqual({
    status: 0,
    error: undefined,
    output: expect.stringContaining('OK'),
  });
});
