import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readFrozenFixture,
  writeEvaluationEvidence,
} from '../../scripts/evaluationEvidence';

it('writes reproducible source/fixture fingerprints and refuses unsafe or overwritten reports', () => {
  const before = process.env.LAFINA_EVALUATION_OUTPUT;
  const local = `docs/reports/evidence-contract-test-${randomUUID()}.json`,
    path = resolve(__dirname, '../..', local);
  try {
    expect(() => readFrozenFixture('unlisted.json')).toThrow();
    process.env.LAFINA_EVALUATION_OUTPUT = local;
    writeEvaluationEvidence('notes', { synthetic: true }, [
      'src/storage/qaSqlChecks.ts',
    ]);
    const report = JSON.parse(readFileSync(path, 'utf8')) as {
      sourceTreeSha256: string;
      sourceHashes: Record<string, string>;
      fixtureHashes: Record<string, string>;
    };
    expect(report.sourceTreeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(report.fixtureHashes)).toHaveLength(3);
    expect(report.sourceHashes['src/storage/qaSqlChecks.ts']).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(() => writeEvaluationEvidence('notes', {}, [])).toThrow();
    process.env.LAFINA_EVALUATION_OUTPUT = '../outside.json';
    expect(() => writeEvaluationEvidence('notes', {}, [])).toThrow();
  } finally {
    if (before === undefined) delete process.env.LAFINA_EVALUATION_OUTPUT;
    else process.env.LAFINA_EVALUATION_OUTPUT = before;
    if (existsSync(path)) unlinkSync(path);
  }
});
