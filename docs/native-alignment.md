# Native alignment evidence

Run the standard-library audit against each actual APK (no extraction or execution):

```powershell
python scripts/audit_apk_alignment.py android/app/build/outputs/apk/qa/app-arm64-v8a-qa.apk --output docs/reports/new-arm64-elf-report.json
```

Exit 0 means all inspected PT_LOAD mappings pass this load-alignment gate; exit 1
means a completed audit found a failure (the JSON is retained); exit 2 means the
audit or fresh report could not be produced. Reports never overwrite earlier files.
Each library is checked for valid ELF class/machine, bounded tables/segments,
power-of-two alignment and congruent file/virtual mappings. Invalid libraries are
ERROR, not skipped. ZIP alignment remains a separate SDK `zipalign` check.

The two 2026-11-04 QA artifacts each contain 16 native libraries. Fourteen per ABI
pass the PT_LOAD gate. `libonnxruntime.so` and `libonnxruntime4j_jni.so` use 4096-byte
load alignment on both ARM64 and x86_64, confirming the known vendor issue. The
first-party Whisper library already uses 16384-byte alignment, so adding first-party
linker flags cannot repair the prebuilt ONNX binaries. No build/library change has
been made. See apk-elf-arm64-2026-11-04.json and apk-elf-x86_64-2026-11-04.json.

RELRO end remainders are recorded as separate observations for loader review; a
PT_LOAD PASS does not certify RELRO correctness, native code page-size assumptions,
audibility or actual device behavior. Never replace phone acceptance with this audit.

References:
- [Android load/ZIP alignment and native build guidance](https://developer.android.com/guide/practices/page-sizes)
- [Upstream ONNX Android alignment issue](https://github.com/microsoft/onnxruntime/issues/25859)

A read-only inspection of the published Maven 1.22.0 AAR confirmed all four
ARM64/x86_64 ONNX libraries pass this PT_LOAD gate. Its SHA-256 and findings are
in onnx-1-22-0-candidate-2026-11-04.json. It was not installed or used by the app.
This is candidate evidence, not proof of LAFINA model compatibility. AGENTS.md requires approval
before changing the dependency. Any approved upgrade needs both ABI rebuilds, repeat
ELF/ZIP inspection, real Silero/Kokoro model initialization/inference and existing
native/UI checks. Preserve the old artifact and saved app data for forward recovery.
