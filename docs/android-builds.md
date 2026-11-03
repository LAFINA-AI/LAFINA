# Android architecture builds

Use the existing JDK/SDK and installed dependencies. From `android/`:

```powershell
.\gradlew.bat :app:assembleQa -PreactNativeArchitectures=x86_64 --offline --max-workers=2
.\gradlew.bat :app:assembleQa -PreactNativeArchitectures=arm64-v8a --offline --max-workers=2
```

QA bundles JavaScript and model assets and uses the development signing key. It is
for local evaluation, not distribution. Debug still uses Metro. Production uses
`:app:assembleRelease` with the owner's existing signing configuration. Never publish
a QA APK as a signed production release or inspect credentials to build one.

Supported splits: arm64-v8a, x86_64, x86. Select only the architecture needed by the
device. No universal APK is generated. Application ID remains `com.lafina`; version
code 9/name 1.3.4 match this application update. Existing installations can update
only with the same signing certificate and compatible version. Do not uninstall or
clear app data to bypass an installation error.

Inspect each built artifact for its single native ABI, bundled JS, model filenames,
package/version/signature, SHA-256 and byte size. Host build/size evidence is not a
phone-speed benchmark. ARM64 physical installation, audible speech, microphone
quality, locked-screen delivery, battery restrictions and reboot behavior still need
a real phone. The existing ONNX Runtime 1.19.2 vendor libraries have a known 16 KiB
alignment warning; these builds do not certify universal 16 KiB device compatibility.


## Verified eight-follow-up build — 2026-11-04

Build both standalone QA splits and the instrumentation harness in one invocation
from `android/` (quote the comma-separated Gradle property in PowerShell):

```powershell
.\gradlew.bat :app:assembleQa :app:assembleDebugAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --offline --max-workers=2 --console=plain
```

See [artifact receipt](reports/capstone-eight-qa-artifacts-2026-11-04.json) and
[offline emulator acceptance](reports/capstone-eight-emulator-2026-11-04.json).
Both artifacts are development-signed QA builds; only x86_64 was installed and
exercised. Profile diagnostics are gated to this QA variant. The existing ONNX ELF
16 KiB warning and physical-device/audio checks remain open.
