# Read-only development setup check

Run `npm run doctor` for a compact status, or `npm run doctor -- --json` for public
machine-readable facts. Exit 0 means the checked requirements are present; exit 1
means something is missing/unsupported/unknown; exit 2 means invalid CLI arguments.
It installs nothing, contacts no network, launches no emulator, changes no files and
does not inspect signing material or any environment file.

Requirements are read from this USTP package's Node policy, Android Gradle/CMake
versions, wrapper version and the installed React Native Java toolchain declaration.
The checker runs only `java -version`, with a bounded capture and timeout. It uses
only named JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT/LOCALAPPDATA paths to find tools;
raw environment values, absolute paths and arbitrary command output are not printed.
SDK/NDK/build-tools/CMake/ADB/wrapper and existing test-dependency presence are checked.
Absent manifests/dependencies stay unknown or missing, rather than causing a silent
installation or fabricated compatible setup.

This is an initial diagnostic, not a build certification or exhaustive future-JDK
compatibility matrix. A READY result does not replace the ordered TypeScript/Jest/
ESLint gates, native builds or physical-device tests. On 2026-11-04 this host passed
11 checks; public versions/presence are in development-doctor-2026-11-04.json.
Four controlled-inventory Node cases are run through the Jest suite; they cover
numeric version comparisons, actual project requirements, missing/unsupported tools,
malformed config, bounded command choice and redaction. No test installs a tool.
