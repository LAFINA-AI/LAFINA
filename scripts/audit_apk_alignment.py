"""Audit bounded ELF program headers in an APK without extraction or native execution."""

import argparse
import hashlib
import json
import re
import struct
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict

PAGE_SIZE = 16384
MAX_PREFIX = 1024 * 1024
MAX_LIBRARY = 512 * 1024 * 1024
MACHINES = {'arm64-v8a': (64, 183), 'x86_64': (64, 62), 'x86': (32, 3)}


class LoadSegment(TypedDict):
    """One validated ELF PT_LOAD mapping."""

    offset: int
    virtualAddress: int
    fileSize: int
    memorySize: int
    alignment: int
    pageCongruent: bool


class ElfEvidence(TypedDict):
    """Load-alignment evidence; deliberately not a full device certificate."""

    status: str
    elfClass: int
    machine: int
    byteOrder: str
    loadSegments: list[LoadSegment]
    relroEndRemainders: list[int]


def inspect_elf(data: bytes, file_size: int | None = None) -> ElfEvidence:
    """Validate ELF32/64 program headers and score 16 KiB load alignment."""
    length = len(data) if file_size is None else file_size
    if len(data) < 16 or data[:4] != b'\x7fELF':
        raise ValueError('Invalid ELF identification.')
    elf_class, encoding, version = data[4:7]
    if elf_class not in (1, 2) or encoding not in (1, 2) or version != 1:
        raise ValueError('Unsupported ELF class, byte order or version.')
    wide = elf_class == 2
    order = '<' if encoding == 1 else '>'
    header_size, entry_size = (64, 56) if wide else (52, 32)
    if len(data) < header_size or length < len(data):
        raise ValueError('Truncated ELF header or invalid declared size.')
    fields = struct.unpack_from(order + ('HHIQQQIHHHHHH' if wide else 'HHIIIIIHHHHHH'), data, 16)
    kind, machine, elf_version = fields[:3]
    program_offset, declared_header, declared_entry, count = fields[4], fields[7], fields[8], fields[9]
    if kind != 3 or elf_version != 1 or declared_header != header_size:
        raise ValueError('Expected a version-one shared-library ELF header.')
    table_end = program_offset + count * declared_entry
    if (declared_entry != entry_size or not 1 <= count <= 4096
            or program_offset < header_size or table_end > min(len(data), length, MAX_PREFIX)):
        raise ValueError('Invalid, extended or out-of-bounds program-header table.')
    loads: list[LoadSegment] = []
    relro: list[int] = []
    for index in range(count):
        values = struct.unpack_from(order + ('IIQQQQQQ' if wide else 'IIIIIIII'),
                                    data, program_offset + index * entry_size)
        segment_type = values[0]
        offset, address, size, memory, alignment = (
            (values[2], values[3], values[5], values[6], values[7]) if wide else
            (values[1], values[2], values[4], values[5], values[7]))
        if offset > length or offset + size > length or (segment_type == 1 and size > memory):
            raise ValueError('Segment lies outside the library or exceeds memory size.')
        if segment_type == 0x6474E552:
            relro.append((address + memory) % PAGE_SIZE)
        if segment_type != 1:
            continue
        if alignment > 1 and (alignment & (alignment - 1) or address % alignment != offset % alignment):
            raise ValueError('Invalid PT_LOAD alignment or incongruent mapping.')
        loads.append({'offset': offset, 'virtualAddress': address, 'fileSize': size,
                      'memorySize': memory, 'alignment': alignment,
                      'pageCongruent': address % PAGE_SIZE == offset % PAGE_SIZE})
    if not loads:
        raise ValueError('No loadable segments were found.')
    accepted = all(row['alignment'] >= PAGE_SIZE and row['pageCongruent'] for row in loads)
    return {'status': 'PASS' if accepted else 'FAIL', 'elfClass': 64 if wide else 32,
            'machine': machine, 'byteOrder': 'little' if encoding == 1 else 'big',
            'loadSegments': loads, 'relroEndRemainders': relro}


def audit_apk(path: Path) -> dict[str, object]:
    """Inspect every packaged native library and retain individual failures."""
    if path.suffix.lower() != '.apk':
        raise ValueError('Choose an APK artifact.')
    libraries: list[dict[str, object]] = []
    with zipfile.ZipFile(path) as archive:
        entries = [row for row in archive.infolist() if row.filename.startswith('lib/')
                   and row.filename.endswith('.so')]
        names = [row.filename for row in entries]
        if not entries or len(entries) > 512 or len(names) != len(set(names)):
            raise ValueError('Missing, excessive or duplicate native ZIP entries.')
        for entry in sorted(entries, key=lambda row: row.filename):
            match = re.fullmatch(r'lib/(arm64-v8a|x86_64|x86)/[A-Za-z0-9_.+-]+\.so', entry.filename)
            if not match:
                raise ValueError('Unknown ABI or malformed native ZIP path.')
            abi = match.group(1)
            row: dict[str, object] = {'path': entry.filename, 'abi': abi, 'bytes': entry.file_size}
            try:
                if entry.file_size > MAX_LIBRARY or entry.flag_bits & 1:
                    raise ValueError('Oversized or encrypted native entry.')
                with archive.open(entry) as stream:
                    evidence = inspect_elf(stream.read(MAX_PREFIX), entry.file_size)
                if (evidence['elfClass'], evidence['machine']) != MACHINES[abi]:
                    raise ValueError('ELF architecture does not match its ABI directory.')
                row.update(evidence)
            except (ValueError, OSError, RuntimeError, zipfile.BadZipFile):
                row.update({'status': 'ERROR', 'error': 'Invalid or unreadable native library.'})
            libraries.append(row)
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'version': 1, 'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
            'artifact': path.name, 'artifactSha256': digest, 'artifactBytes': path.stat().st_size,
            'status': 'PASS' if all(row['status'] == 'PASS' for row in libraries) else 'FAIL',
            'pageSizeBytes': PAGE_SIZE, 'zipAlignment': 'NOT_CHECKED', 'libraries': libraries,
            'limits': ['PT_LOAD evidence only; not runtime, RELRO or physical-device certification.',
                       'RELRO end remainders are observations for separate review, not a loader verdict.',
                       'ZIP alignment and ELF load alignment are independent checks.',
                       '32-bit results are informational; Android 16 KiB requirement concerns 64-bit ABIs.']}


def write_report(report: dict[str, object], destination: Path, root: Path) -> None:
    """Write new evidence only within canonical docs/reports, never overwrite."""
    reports = (root / 'docs' / 'reports').resolve()
    resolved = destination.resolve()
    if resolved.suffix != '.json' or not resolved.is_relative_to(reports):
        raise ValueError('Choose a fresh JSON path inside docs/reports.')
    with resolved.open('x', encoding='utf-8', newline='\n') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


def main() -> int:
    """Run an explicit APK audit; nonzero status preserves a failed report."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        report = audit_apk(args.apk)
        write_report(report, args.output, Path(__file__).resolve().parents[1])
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(2, f'Audit unavailable: {error}\n')
    print(json.dumps({'status': report['status'], 'libraries': len(report['libraries']),
                      'report': str(args.output)}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
