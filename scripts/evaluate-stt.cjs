/* Explicit host-only scoring CLI. Never opens a microphone, model or scheduler. */
const {readFileSync, realpathSync, statSync} = require('node:fs');
const {resolve, relative, isAbsolute, extname, basename, sep} = require('node:path');
const {createHash} = require('node:crypto');
const {createReport, writeNewReport} = require('./stt-metrics.cjs');
const root = resolve(__dirname, '..');

/** Loads and hashes the unchanged fixed public English text corpus. */
function readCorpus() {
  const bytes = readFileSync(resolve(root, 'evaluation/stt-corpus-v1.json'));
  const manifest = JSON.parse(readFileSync(resolve(root, 'evaluation/stt-fixture-manifest-v1.json'), 'utf8'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (manifest.version !== 1 || manifest.sha256 !== hash) throw new Error('Frozen STT corpus changed; version it separately.');
  return {corpus: JSON.parse(bytes.toString('utf8')), hash};
}

/** Evaluates an explicit cohort, or a prominently labelled scorer-only self-test. */
function main(args) {
  const selfTest = args.length === 3 && args[0] === '--self-test' && args[1] === '--output';
  if (!selfTest && !(args.length === 4 && args[0] === '--input' && args[2] === '--output'))
    throw new Error('Use --input .local/stt/new-cohort.json --output docs/reports/new.json, or --self-test --output docs/reports/new.json.');
  const {corpus, hash} = readCorpus();
  let batch;
  if (selfTest) {
    batch = {version: 1, corpusSha256: hash, artifactSha256: '0'.repeat(64),
      provenance: 'SCORER_SELF_TEST', engine: {name: 'Whisper.cpp', version: 'scorer-only',
        model: 'NOT_RUN', modelSha256: '0'.repeat(64)}, repetitionsPerCondition: 1,
      samples: corpus.samples.flatMap(sample => ['cold','warm'].map(condition => ({
        caseId: sample.id, condition, iteration: 0, outcome: 'RESULT', hypothesis: sample.reference, elapsedMs: 0,
      })))};
  } else {
    const allowed = realpathSync(resolve(root, '.local/stt'));
    const input = realpathSync(resolve(root, args[1])), local = relative(allowed, input);
    if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`) || extname(input) !== '.json'
        || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.json$/.test(basename(input))
        || statSync(input).size > 2 * 1024 * 1024)
      throw new Error('Choose a bounded explicit cohort JSON inside .local/stt.');
    batch = JSON.parse(readFileSync(input, 'utf8'));
  }
  const report = createReport(batch, corpus, hash);
  if (selfTest) report.limits.unshift('All hypotheses/times are constructed scorer assertions; no model/audio ran. Zero times are synthetic constants.');
  writeNewReport(report, args[selfTest ? 2 : 3], root);
  console.log(JSON.stringify({classification: report.classification, samples: report.metrics.samples}));
}

if (require.main === module) {
  try {main(process.argv.slice(2));} catch (error) {
    console.error(error instanceof Error ? error.message : 'Evaluation unavailable.');
    process.exitCode = 1;
  }
}
module.exports = {main, readCorpus};
