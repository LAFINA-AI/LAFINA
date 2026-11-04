import test from 'node:test';
import assert from 'node:assert/strict';
import { join, relative, resolve } from 'node:path';
import {
  parseVersion,
  isAtLeast,
  readRequirements,
  runDoctor,
} from '../doctor.mjs';

const root = resolve('doctor-fixture');
const fixtures = {
  'package.json': JSON.stringify({ engines: { node: '>=22.11.0' } }),
  'android/build.gradle':
    'buildToolsVersion = "36.0.0"\ncompileSdkVersion = 34\nndkVersion = "27.1.12297006"',
  'android/app/build.gradle': 'compileSdk 34',
  'android/app/src/main/cpp/CMakeLists.txt':
    'cmake_minimum_required(VERSION 3.22.1)',
  'android/gradle/wrapper/gradle-wrapper.properties':
    'distributionUrl=https://services.gradle.org/distributions/gradle-9.3.1-bin.zip',
  'node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/build.gradle.kts':
    'kotlin { jvmToolchain(17) }',
};
function ports(overrides = {}) {
  const reads = [];
  const commands = [];
  return {
    reads,
    commands,
    env: {
      JAVA_HOME: join(root, 'PRIVATE_HOME'),
      ANDROID_HOME: join(root, 'PRIVATE_SDK'),
    },
    nodeVersion: 'v24.19.0',
    read: file => {
      const name = relative(root, file).replaceAll('\\', '/');
      reads.push(name);
      if (!(name in fixtures)) throw new Error('missing');
      return fixtures[name];
    },
    exists: () => true,
    run: (command, args) => {
      commands.push([command, args]);
      return {
        status: 0,
        stdout: '',
        stderr: 'openjdk version "21.0.4"\nPRIVATE RAW OUTPUT',
      };
    },
    ...overrides,
  };
}
test('compares versions numerically rather than alphabetically', () => {
  assert.deepEqual(parseVersion('v24.19.0'), [24, 19, 0]);
  assert.deepEqual(parseVersion('openjdk version "17.0.12"'), [17, 0, 12]);
  assert.equal(parseVersion('unknown'), null);
  assert.equal(isAtLeast([22, 11, 0], [22, 11, 0]), true);
  assert.equal(isAtLeast([22, 9, 0], [22, 11, 0]), false);
});
test('reads actual project tool versions and exposes only public facts', () => {
  const io = ports();
  const expected = readRequirements(root, io.read);
  assert.equal(expected.compileSdk, '34');
  assert.equal(expected.ndk, '27.1.12297006');
  assert.equal(expected.cmake, '3.22.1');
  assert.equal(expected.gradle, '9.3.1');
  assert.equal(expected.javaMinimum, 17);
  const report = runDoctor(root, io);
  assert.equal(report.status, 'READY');
  assert.ok(report.checks.every(c => c.status === 'PASS'));
  assert.ok(io.reads.every(path => !path.includes('.env')));
  assert.deepEqual(io.commands[0][1], ['-version']);
  assert.equal(io.commands.length, 1);
  const output = JSON.stringify(report);
  assert.ok(!output.includes('PRIVATE'));
  assert.ok(!output.includes(root));
});
test('reports missing SDK/dependencies and unsupported Node/Java without installation', () => {
  const io = ports({
    env: {},
    nodeVersion: 'v22.10.0',
    exists: () => false,
    run: () => ({ status: 0, stdout: '', stderr: 'java version "1.8.0_402"' }),
  });
  const report = runDoctor(root, io);
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.checks.find(c => c.id === 'node').status, 'UNSUPPORTED');
  assert.equal(report.checks.find(c => c.id === 'java').status, 'UNSUPPORTED');
  assert.equal(
    report.checks.find(c => c.id === 'sdk-platform').status,
    'MISSING',
  );
});
test('handles missing tools, malformed policies and unreadable config safely', () => {
  const missing = runDoctor(
    root,
    ports({
      run: () => ({ status: null, stdout: '', stderr: 'PRIVATE ERROR' }),
    }),
  );
  assert.equal(missing.checks.find(c => c.id === 'java').status, 'MISSING');
  const malformed = runDoctor(
    root,
    ports({
      read: () => {
        throw new Error('PRIVATE PATH');
      },
    }),
  );
  assert.equal(malformed.status, 'INCOMPLETE');
  assert.equal(malformed.checks[0].status, 'UNKNOWN');
  assert.ok(!JSON.stringify(malformed).includes('PRIVATE'));
  const weird = ports({
    read: file => (file.endsWith('package.json') ? '{}' : ports().read(file)),
  });
  assert.throws(() => readRequirements(root, weird.read));
});
