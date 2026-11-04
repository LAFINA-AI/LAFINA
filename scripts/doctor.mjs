import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{id:string,status:'PASS'|'MISSING'|'UNSUPPORTED'|'UNKNOWN',expected:string,observed:string|null}} ToolCheck */
/** @typedef {{read?:(file:string)=>string,exists?:(file:string)=>boolean,run?:(command:string,args:string[])=>{status:number|null,stdout:string,stderr:string},env?:Record<string,string|undefined>,nodeVersion?:string}} DoctorPorts */
const self = fileURLToPath(import.meta.url);

/** Parses a Node/Java version without returning any surrounding diagnostic text. */
export function parseVersion(value) {
  const match =
    typeof value === 'string'
      ? value.match(/(?:^v?|version\s+")(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
      : null;
  return match
    ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
    : null;
}
/** Compares numeric version tuples. */
export function isAtLeast(actual, minimum) {
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}
/** Reads only fixed, nonsensitive project manifests to derive actual tool requirements. */
export function readRequirements(
  root,
  read = file => readFileSync(file, 'utf8'),
) {
  const pkg = JSON.parse(read(join(root, 'package.json')));
  const policy = pkg.engines?.node;
  const node =
    typeof policy === 'string' ? policy.match(/^>=\s*(\d+\.\d+\.\d+)$/) : null;
  if (!node) throw new Error('Unsupported Node requirement.');
  const gradle = read(join(root, 'android/build.gradle'));
  const app = read(join(root, 'android/app/build.gradle'));
  const cmake = read(join(root, 'android/app/src/main/cpp/CMakeLists.txt'));
  const wrapper = read(
    join(root, 'android/gradle/wrapper/gradle-wrapper.properties'),
  );
  const required = (text, pattern) => {
    const match = text.match(pattern);
    if (!match) throw new Error('Missing project tool version.');
    return match[1];
  };
  let javaMinimum = null;
  try {
    const plugin = read(
      join(
        root,
        'node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/build.gradle.kts',
      ),
    );
    javaMinimum = Number(required(plugin, /jvmToolchain\((\d+)\)/));
  } catch {
    /* Missing installed dependencies remain explicitly unknown. */
  }
  return {
    nodeMinimum: node[1],
    javaMinimum,
    compileSdk:
      app.match(/compileSdk\s+(\d+)/)?.[1] ??
      required(gradle, /compileSdkVersion\s*=\s*(\d+)/),
    buildTools: required(gradle, /buildToolsVersion\s*=\s*"([0-9.]+)"/),
    ndk: required(gradle, /ndkVersion\s*=\s*"([0-9.]+)"/),
    cmake: required(cmake, /cmake_minimum_required\(VERSION\s+([0-9.]+)/),
    gradle: required(wrapper, /gradle-([0-9.]+)-(?:bin|all)\.zip/),
  };
}

/** Collects allowlisted public version/presence facts; never installs or reads environment files.
 * @param {string} root
 * @param {DoctorPorts} ports
 */
export function runDoctor(root = resolve(dirname(self), '..'), ports = {}) {
  const read = ports.read ?? (file => readFileSync(file, 'utf8')),
    exists = ports.exists ?? existsSync;
  const run =
    ports.run ??
    ((command, args) =>
      spawnSync(command, args, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 16384,
      }));
  // Read named path variables only. Never enumerate or print process.env.
  const env = ports.env ?? {
    JAVA_HOME: process.env.JAVA_HOME,
    ANDROID_HOME: process.env.ANDROID_HOME,
    ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  const checks = [];
  const report = {
    version: 1,
    recordedAtUtc: new Date().toISOString(),
    status: 'INCOMPLETE',
    sourceSha256: createHash('sha256').update(readFileSync(self)).digest('hex'),
    requirements: null,
    checks,
    limits: [
      'Read-only version/presence checks, not compilation, emulator or physical-device certification.',
      'No package installation, environment-file access, signing inspection or full environment/path output.',
    ],
  };
  let expected;
  try {
    expected = readRequirements(root, read);
    report.requirements = expected;
  } catch {
    checks.push({
      id: 'configuration',
      status: 'UNKNOWN',
      expected: 'readable project tool requirements',
      observed: null,
    });
    return report;
  }
  const version = (id, observed, minimum) => {
    const actual = parseVersion(observed),
      needed = parseVersion(minimum);
    checks.push({
      id,
      status: !actual
        ? 'MISSING'
        : !needed
        ? 'UNKNOWN'
        : isAtLeast(actual, needed)
        ? 'PASS'
        : 'UNSUPPORTED',
      expected: `>=${minimum ?? 'unknown'}`,
      observed: actual ? actual.join('.') : null,
    });
  };
  version('node', ports.nodeVersion ?? process.version, expected.nodeMinimum);
  const javaCommand = env.JAVA_HOME
    ? join(
        env.JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java',
      )
    : 'java';
  let java;
  try {
    java = run(javaCommand, ['-version']);
  } catch {
    java = null;
  }
  const javaVersion =
    java?.status === 0
      ? parseVersion(`${java.stderr ?? ''}\n${java.stdout ?? ''}`.trim())
      : null;
  const major = javaVersion?.[0] === 1 ? javaVersion[1] : javaVersion?.[0];
  checks.push({
    id: 'java',
    status: !javaVersion
      ? 'MISSING'
      : !expected.javaMinimum
      ? 'UNKNOWN'
      : major >= expected.javaMinimum
      ? 'PASS'
      : 'UNSUPPORTED',
    expected: expected.javaMinimum
      ? `>=${expected.javaMinimum}`
      : 'installed React Native Java policy',
    observed: javaVersion ? javaVersion.join('.') : null,
  });
  const sdk =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    (process.platform === 'win32' && env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, 'Android', 'Sdk')
      : null);
  const presence = (id, path, description) => {
    const found = Boolean(path && exists(path));
    checks.push({
      id,
      status: found ? 'PASS' : 'MISSING',
      expected: description,
      observed: found ? 'present' : null,
    });
  };
  presence(
    'sdk-platform',
    sdk && join(sdk, `platforms/android-${expected.compileSdk}`),
    `android-${expected.compileSdk}`,
  );
  presence(
    'sdk-build-tools',
    sdk && join(sdk, `build-tools/${expected.buildTools}`),
    expected.buildTools,
  );
  presence('sdk-ndk', sdk && join(sdk, `ndk/${expected.ndk}`), expected.ndk);
  presence(
    'sdk-cmake',
    sdk && join(sdk, `cmake/${expected.cmake}`),
    expected.cmake,
  );
  presence(
    'adb',
    sdk &&
      join(
        sdk,
        'platform-tools',
        process.platform === 'win32' ? 'adb.exe' : 'adb',
      ),
    'installed platform-tools',
  );
  presence(
    'gradle-wrapper',
    join(root, 'android/gradle/wrapper/gradle-wrapper.jar'),
    expected.gradle,
  );
  for (const [name, file] of [
    ['typescript', 'typescript/bin/tsc'],
    ['jest', 'jest/bin/jest.js'],
    ['sqlite', 'better-sqlite3/package.json'],
  ])
    presence(
      `dependency-${name}`,
      join(root, 'node_modules', file),
      'existing project dependency',
    );
  report.status = checks.every(check => check.status === 'PASS')
    ? 'READY'
    : 'INCOMPLETE';
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === self) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--json')) {
    console.error('Use node scripts/doctor.mjs [--json]');
    process.exitCode = 2;
  } else {
    const report = runDoctor();
    console.log(
      args[0] === '--json'
        ? JSON.stringify(report, null, 2)
        : report.checks
            .map(
              c =>
                `${c.status}: ${c.id}; expected ${c.expected}; observed ${
                  c.observed ?? 'not available'
                }`,
            )
            .join('\n'),
    );
    process.exitCode = report.status === 'READY' ? 0 : 1;
  }
}
