# Speech recognition evaluation

`npm run evaluate:stt -- --input .local/stt/new-cohort.json --output docs/reports/new-stt.json`

This host-only tool scores an explicitly collected cohort; it never records,
loads a model, sends commands to LAFINA or downloads anything. The six public
English reference texts are frozen in evaluation/stt-corpus-v1.json; the separate
STT manifest hashes their exact bytes without changing the previous command corpus.
Keep raw inputs and generated audio in ignored .local/stt. No student audio belongs
in Git. Consent and review are required before using actual microphone material.

The strict version-one input contract is SttBatch in scripts/sttEvaluationTypes.ts.
Supply the corpus hash, actual APK hash, observed engine/model identity, repetitions
per condition (1-30), and exactly one sample for every case/condition/iteration.
Conditions are cold/warm. Each sample records RESULT/EMPTY/ERROR, hypothesis and
finite nonnegative elapsed milliseconds. RESULT must contain words; EMPTY/ERROR
must have an empty hypothesis. Whisper model SHA-256 is required; Android's opaque
system model hash is null, rather than a fabricated digest. Capture provenance is
DIRECT_SYNTHETIC_PCM or CONSENTED_MICROPHONE; the collector must document how it
obtained that evidence. A declared provenance label cannot authenticate an origin.

Scores use word-level Levenshtein edits, with substitution/deletion/insertion tie
order. Unicode normalization, English lowercase and punctuation normalization
apply; number words and digits remain different. Reported WER is edits/reference
words and can exceed 1. Empty reference WER is null. Error/empty requests count as
missing words in the aggregate so failed requests cannot inflate apparent accuracy.
Verbatim and normalized exact matches are separate. Cold/warm summaries report
the conventional median and nearest-rank p95, including failed requests' durations.
These are request measurements, not acoustic first audibility or model intent accuracy.

Reports export aggregate scores and per-case hypothesis fingerprints, not raw text.
Hashes can still identify predictable text; they are not anonymization. Output must
be a fresh JSON file inside canonical docs/reports, including symlink checks. Input
must be bounded explicit JSON inside canonical .local/stt; environment files are
never read. Existing reports are not overwritten. Preserve the capture procedure,
model/APK hashes, timing definition and any omitted device conditions alongside it.

`npm run evaluate:stt -- --self-test --output docs/reports/new-scorer-check.json`
constructs perfect text pairs with synthetic zero timings solely to exercise report
formatting. Its classification is SCORER_SELF_TEST_NOT_RECOGNITION_EVIDENCE. The
committed scorer self-test did not run Whisper, Android recognition or a microphone.
Actual inference and physical microphone/accent/noise/latency remain separate runs.

## Observed synthetic inference, 2026-11-04

The opt-in collector in [emulator-qa.md](emulator-qa.md) ran real bundled English
Whisper on six Kokoro-generated source WAVs, once per fresh context and once per
shared context. See `reports/stt-emulator-verified-2026-11-04.json` and its linked
score report `reports/stt-sba04186ad432.json`. All 12 attempts returned text; zero
empty/error attempts. Aggregate word error was 8 edits / 72 reference words =
11.11%; normalized exact matches were 6/12, verbatim matches 0/12. No result was
corrected or excluded to improve the score. Number words and digits remain distinct.

Fresh-context median/p95: 6,946.92 / 7,443.51 ms. Shared-context median/p95:
6,934.43 / 7,150.44 ms. Each condition has only six observations and p95 is its
maximum. These x86_64 emulator figures are not phone performance targets. Cold
means a fresh Whisper context, not a cold OS/filesystem cache. Model loading is
included only in cold; Kokoro generation, resampling and context freeing are
excluded. The source WAVs were removed; raw synthetic hypotheses remain ignored.

The initial native collection returned a success code, but the host could not
verify CRLF-terminated cleanup fields. Its failed report is preserved separately.
The final reader normalizes CRLF, with regression checks for both newline styles;
the successful retry collected a fresh cohort rather than relabelling old evidence.
Real microphone/VAD, Filipino-accent/noise, Android system recognition and phone
latency remain unmeasured. No speech model/default was changed by this benchmark.

A second successful collection binds the final runner safety correction to fresh
evidence: `reports/stt-emulator-final-2026-11-04.json` and
`reports/stt-sef280d0051fe.json`. It again observed 12 results, 8/72 word edits and
confirmed source removal. Fresh-context median/p95 were 7,093.13/7,317.23 ms;
shared-context 6,795.07/7,004.13 ms. Earlier observations remain unchanged.
