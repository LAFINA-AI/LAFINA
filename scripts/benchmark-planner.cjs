const {spawnSync} = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, [path.resolve('node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath', '__tests__/evaluation/plannerBenchmark.test.ts'], {stdio: 'inherit', env: {...process.env, LAFINA_BENCHMARK: '1'}});
process.exitCode = result.status ?? 1;
