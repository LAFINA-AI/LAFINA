import { spawnSync } from 'node:child_process';

it('checks setup diagnostics against controlled public inventories without installing tools', () => {
  const result = spawnSync(
    process.execPath,
    ['--test', 'scripts/tests/doctor.test.mjs'],
    { encoding: 'utf8', timeout: 20000 },
  );
  expect({
    status: result.status,
    error: result.error?.message,
    output: result.stdout,
  }).toEqual({
    status: 0,
    error: undefined,
    output: expect.stringMatching(/(?:pass 4|tests 4)/),
  });
});
