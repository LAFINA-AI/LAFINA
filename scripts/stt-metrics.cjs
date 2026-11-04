/* Host-only fixed-corpus scoring. This module never imports or mutates app state. */
const {createHash} = require('node:crypto');
const {readFileSync, writeFileSync, realpathSync} = require('node:fs');
const {resolve, relative, isAbsolute, dirname, extname} = require('node:path');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;

function words(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
    throw new Error('Supply bounded transcript text.');
  const tokens = value.normalize('NFKC').toLocaleLowerCase('en')
    .replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
  if (tokens.length > 400) throw new Error('Transcript exceeds 400 words.');
  return tokens;
}

/** Scores normalized words with stable substitution/deletion/insertion tie order. */
function scoreWords(reference, hypothesis) {
  const ref = words(reference), hyp = words(hypothesis);
  const grid = Array.from({length: ref.length + 1}, () => new Uint16Array(hyp.length + 1));
  for (let r = 0; r <= ref.length; r++) grid[r][0] = r;
  for (let h = 0; h <= hyp.length; h++) grid[0][h] = h;
  for (let r = 1; r <= ref.length; r++)
    for (let h = 1; h <= hyp.length; h++)
      grid[r][h] = Math.min(grid[r - 1][h - 1] + Number(ref[r - 1] !== hyp[h - 1]),
        grid[r - 1][h] + 1, grid[r][h - 1] + 1);
  let r = ref.length, h = hyp.length, substitutions = 0, deletions = 0, insertions = 0;
  while (r || h) {
    if (r && h && ref[r - 1] === hyp[h - 1] && grid[r][h] === grid[r - 1][h - 1]) {r--; h--;}
    else if (r && h && grid[r][h] === grid[r - 1][h - 1] + 1) {substitutions++; r--; h--;}
    else if (r && grid[r][h] === grid[r - 1][h] + 1) {deletions++; r--;}
    else {insertions++; h--;}
  }
  const errors = substitutions + deletions + insertions;
  return {referenceWords: ref.length, hypothesisWords: hyp.length, substitutions,
    deletions, insertions, errors, wer: ref.length ? errors / ref.length : null,
    normalizedExactMatch: errors === 0, verbatimExactMatch: reference === hypothesis};
}

/** Reports median and nearest-rank p95 for observed, bounded request durations. */
function summarizeTimings(values) {
  if (!Array.isArray(values) || values.length > 720 || values.some(v => !Number.isFinite(v) || v < 0 || v > 600000))
    throw new Error('Invalid elapsed request times.');
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return {n, p50Ms: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    p95Ms: n ? sorted[Math.ceil(n * .95) - 1] : null, maxMs: n ? sorted[n - 1] : null};
}

function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
    throw new Error('Unexpected evaluation shape.');
}
function text(value) {return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ._+/-]{0,95}$/.test(value);}

/** Validates a complete versioned cohort and emits hashes/scores, never transcript text. */
function createReport(input, corpus, corpusSha256) {
  keys(input, ['version','corpusSha256','artifactSha256','provenance','engine','repetitionsPerCondition','samples']);
  keys(corpus, ['version','classification','samples']);
  if (corpus.version !== 1 || corpus.classification !== 'PUBLIC_SYNTHETIC_ENGLISH_TEXT'
      || !Array.isArray(corpus.samples) || !corpus.samples.length || corpus.samples.length > 12)
    throw new Error('Invalid fixed corpus.');
  const references = new Map();
  for (const row of corpus.samples) {
    keys(row, ['id','reference']);
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(row.id) || references.has(row.id) || !words(row.reference).length)
      throw new Error('Invalid fixed corpus reference.');
    references.set(row.id, row.reference);
  }
  const repeat = input.repetitionsPerCondition;
  if (input.version !== 1 || !hashPattern.test(corpusSha256) || input.corpusSha256 !== corpusSha256
      || !hashPattern.test(input.artifactSha256) || !Number.isInteger(repeat) || repeat < 1 || repeat > 30
      || !['DIRECT_SYNTHETIC_PCM','CONSENTED_MICROPHONE','SCORER_SELF_TEST'].includes(input.provenance)
      || !Array.isArray(input.samples) || input.samples.length !== references.size * 2 * repeat)
    throw new Error('Invalid or incomplete evaluation cohort.');
  keys(input.engine, ['name','version','model','modelSha256']);
  if (!['Whisper.cpp','AndroidOnDevice'].includes(input.engine.name) || !text(input.engine.version)
      || !text(input.engine.model) || (input.engine.name === 'Whisper.cpp'
        ? !hashPattern.test(input.engine.modelSha256) : input.engine.modelSha256 !== null))
    throw new Error('Invalid engine provenance.');
  const seen = new Set(), cases = [], times = {cold: [], warm: []};
  const counts = {RESULT: 0, EMPTY: 0, ERROR: 0};
  let referenceWords = 0, errors = 0, normalizedExactMatches = 0, verbatimExactMatches = 0;
  for (const row of input.samples) {
    keys(row, ['caseId','condition','iteration','outcome','hypothesis','elapsedMs']);
    const key = `${row.caseId}:${row.condition}:${row.iteration}`;
    if (!references.has(row.caseId) || !['cold','warm'].includes(row.condition)
        || !Number.isInteger(row.iteration) || row.iteration < 0 || row.iteration >= repeat || seen.has(key)
        || !['RESULT','EMPTY','ERROR'].includes(row.outcome) || typeof row.hypothesis !== 'string'
        || (row.outcome === 'RESULT' ? !words(row.hypothesis).length : row.hypothesis !== ''))
      throw new Error('Invalid or duplicate evaluation sample.');
    summarizeTimings([row.elapsedMs]); seen.add(key); counts[row.outcome]++;
    const score = scoreWords(references.get(row.caseId), row.hypothesis);
    referenceWords += score.referenceWords; errors += score.errors;
    normalizedExactMatches += Number(score.normalizedExactMatch); verbatimExactMatches += Number(score.verbatimExactMatch);
    times[row.condition].push(row.elapsedMs);
    cases.push({caseId: row.caseId, condition: row.condition, iteration: row.iteration,
      outcome: row.outcome, hypothesisSha256: sha256(row.hypothesis), score});
  }
  return {version: 1, classification: input.provenance === 'SCORER_SELF_TEST'
    ? 'SCORER_SELF_TEST_NOT_RECOGNITION_EVIDENCE' : 'OBSERVED_STT_COHORT_NOT_PHONE_CERTIFICATION',
  recordedAtUtc: new Date().toISOString(), corpusSha256, artifactSha256: input.artifactSha256,
  sourceSha256: sha256(readFileSync(__filename)), engine: {...input.engine}, provenance: input.provenance,
  metrics: {samples: cases.length, result: counts.RESULT, empty: counts.EMPTY, error: counts.ERROR,
    referenceWords, errors, werIncludingFailures: referenceWords ? errors / referenceWords : null,
    normalizedExactMatches, verbatimExactMatches,
    cold: summarizeTimings(times.cold), warm: summarizeTimings(times.warm)}, cases,
  limits: ['WER is word transcription error, not intent accuracy or scheduling safety.',
    'Empty/error requests count as missing reference words; failures are not discarded.',
    'Times include failed requests and do not measure acoustic audibility.',
    'Synthetic PCM does not establish microphone, accent, noise, battery or phone performance.',
    'Provenance is supplied by the collector; this scorer cannot authenticate recording origin.',
    'No raw hypotheses are exported; transcript hashes are fingerprints, not anonymization.']};
}

/** Writes exclusive JSON evidence beneath canonical docs/reports; rejects symlink escapes. */
function writeNewReport(report, output, root = resolve(__dirname, '..')) {
  const allowed = realpathSync(resolve(root, 'docs/reports'));
  const destination = resolve(root, output), parent = realpathSync(dirname(destination));
  const local = relative(allowed, parent);
  if (extname(destination) !== '.json' || isAbsolute(local) || local === '..' || local.startsWith(`..${require('node:path').sep}`))
    throw new Error('Choose a new JSON path inside docs/reports.');
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
module.exports = {scoreWords, summarizeTimings, createReport, writeNewReport};
