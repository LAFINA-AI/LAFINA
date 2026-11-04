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
