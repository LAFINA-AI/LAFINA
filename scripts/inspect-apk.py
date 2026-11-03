"""Inspect an existing APK without extracting it or touching app data."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def inspect_apk(path: Path, abi: str) -> dict[str, object]:
    """Verify a single-ABI standalone APK and report measured artifact metadata."""
    if path.suffix.lower() != '.apk':
        raise ValueError('An APK path is required.')
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        abis = sorted({name.split('/')[1] for name in names
                       if name.startswith('lib/') and name.endswith('.so')})
        models = sorted(name for name in names if name.startswith('assets/models/'))
        if abis != [abi]:
            raise ValueError(f'Unexpected native architectures: {abis}')
        if 'assets/index.android.bundle' not in names:
            raise ValueError('Standalone JavaScript bundle is missing.')
        for required in ('ggml-tiny.en-q5_1.bin', 'SmolLM2-135M-Instruct.gguf',
                         'silero_vad.onnx', 'kokoro-v0_19.onnx', 'af_bella.bin', 'cmudict.txt'):
            if not any(name.endswith(required) for name in models):
                raise ValueError(f'Missing required offline model: {required}')
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'path': str(path.resolve()), 'bytes': path.stat().st_size,
            'sha256': digest, 'nativeAbis': abis, 'models': models,
            'bundledJavaScript': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--abi', required=True, choices=['arm64-v8a', 'x86_64', 'x86'])
    args = parser.parse_args()
    print(json.dumps(inspect_apk(args.apk, args.abi), indent=2))
