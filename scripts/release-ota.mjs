/**
 * Builds and signs an in-app update: the JavaScript bundle and images, zipped,
 * with a signed manifest that installed copies check before using it.
 *
 *   npm run release:ota
 *   npm run release:ota -- --skip-build          # reuse the last release bundle build
 *   npm run release:ota -- --key <path>
 *
 * Writes into release/:
 *   lafina-android-bundle-<version>.zip   the bundle, exactly as a release APK carries it
 *   lafina-update-android.json            the signed manifest
 *
 * Upload both to one GitHub release. The version is package.json's; the APK
 * build it runs on is android/app/build.gradle's versionCode.
 *
 * The key is read from --key, then LAFINA_ANDROID_UPDATE_KEY, then the
 * default path `npm run release:keygen` uses.
 */
import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = resolve(repoRoot, 'android');
const PRODUCT_ID = 'com.lafina';
const MANIFEST_NAME = 'lafina-update-android.json';
const BUNDLE_FILE = 'index.android.bundle';
const outDir = resolve(repoRoot, 'release');

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// ── Versions ───────────────────────────────────────────────────────────────

const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`package.json version "${version}" is not a plain semantic version (like 1.2.3).`);
}
const gradle = readFileSync(resolve(androidDir, 'app', 'build.gradle'), 'utf8');
const versionCodeMatch = /^\s*versionCode\s+(\d+)/m.exec(gradle);
if (!versionCodeMatch) fail('Could not find versionCode in android/app/build.gradle.');
const nativeVersionCode = Number(versionCodeMatch[1]);

// ── Signing key ────────────────────────────────────────────────────────────

const embedded = /export const UPDATE_PUBLIC_KEY: string = '([^']*)';/.exec(
  readFileSync(resolve(repoRoot, 'src', 'updates', 'releaseKey.ts'), 'utf8'),
)?.[1];
if (!embedded) fail('src/updates/releaseKey.ts has no release key yet. Run `npm run release:keygen` first.');

const keyPath = resolve(
  argument('--key') ?? process.env.LAFINA_ANDROID_UPDATE_KEY ?? resolve(homedir(), '.lafina', 'lafina-android-update-key.pem'),
);
if (!existsSync(keyPath)) fail(`No signing key at ${keyPath}. Create one with \`npm run release:keygen\`.`);
const privateKey = createPrivateKey(readFileSync(keyPath));
if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
  fail('The signing key must be an ECDSA P-256 key.');
}
const publicBase64 = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
if (publicBase64 !== embedded) {
  fail(
    'This key does not match UPDATE_PUBLIC_KEY in src/updates/releaseKey.ts.\n' +
      'Installed copies would reject the update. Sign with the key the app was built with.',
  );
}

// ── Build ──────────────────────────────────────────────────────────────────

if (!process.argv.includes('--skip-build')) {
  console.log('Building the release bundle (the same Gradle task a release APK runs)…\n');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const result = spawnSync(gradlew, [':app:createBundleReleaseJsAndAssets'], {
    cwd: androidDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) fail('\nThe bundle build failed. Fix the error above and run this again.');
}

const bundlePath = resolve(androidDir, 'app', 'build', 'generated', 'assets', 'react', 'release', BUNDLE_FILE);
const resDir = resolve(androidDir, 'app', 'build', 'generated', 'res', 'react', 'release');
if (!existsSync(bundlePath)) fail(`No bundle at ${bundlePath}. Run without --skip-build.`);

/** Every file under `dir`, as zip entry names relative to it. */
const filesUnder = (dir) => {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
};

// ── Zip ────────────────────────────────────────────────────────────────────

/**
 * A plain zip, built here so releasing needs nothing installed beyond Node.
 * Timestamps are fixed, so the same bundle always zips to the same bytes.
 */
const createZip = (entries) => {
  const DOS_DATE_1980_01_01 = 0x21;
  const UTF8_NAMES = 0x0800;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBytes, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_NAMES, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
};

const entries = [
  { name: BUNDLE_FILE, data: readFileSync(bundlePath) },
  // Images sit beside the bundle, where React Native looks for them when it
  // runs a bundle from a file instead of from the APK.
  ...filesUnder(resDir).map((name) => ({ name, data: readFileSync(join(resDir, ...name.split('/'))) })),
];

const file = `lafina-android-bundle-${version}.zip`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.zip$/.test(file)) {
  // The app downloads it by this exact name, and GitHub rewrites unusual characters.
  fail(`"${file}" is not a plain file name. Use a version with only letters, digits, dots and dashes.`);
}
const zip = createZip(entries);

// ── Manifest ───────────────────────────────────────────────────────────────

const manifest = {
  schema: 1,
  product: PRODUCT_ID,
  version,
  platform: 'android',
  nativeVersionCode,
  file,
  size: zip.length,
  sha256: createHash('sha256').update(zip).digest('hex'),
  signedAt: new Date().toISOString(),
};
const payload = Buffer.from(JSON.stringify(manifest), 'utf8');
const signature = sign('sha256', payload, privateKey);
if (!verify('sha256', payload, createPublicKey(privateKey), signature)) fail('The signature did not verify. Nothing was written.');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, file), zip);
writeFileSync(
  join(outDir, MANIFEST_NAME),
  `${JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }, null, 2)}\n`,
);

const rel = (name) => relative(repoRoot, join(outDir, name)).split(sep).join('/');
console.log(`\nSigned ${file}: version ${version} for APK build ${nativeVersionCode}, ${(zip.length / 1024 / 1024).toFixed(1)} MB, ${entries.length} files`);
console.log(`Wrote ${rel(file)} and ${rel(MANIFEST_NAME)}\n`);
console.log('Publish both as one normal release (not a draft or pre-release):\n');
console.log(`gh release create v${version} "${rel(file)}" "${rel(MANIFEST_NAME)}" --title "v${version}" --notes "What changed"\n`);
console.log(
  `Phones on APK build ${nativeVersionCode} update in place. If this release changes native code, bump versionCode,\n` +
    'build the APK, run this again, and attach android/app/build/outputs/apk/release/app-release.apk too;\n' +
    'phones on older builds are then pointed to the release page to install it.',
);
