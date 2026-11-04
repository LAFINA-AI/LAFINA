"""Synthetic ELF and ZIP tests; no SDK, application data or native execution."""

import importlib.util
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    'apk_alignment', Path(__file__).parents[1] / 'audit_apk_alignment.py')
assert SPEC and SPEC.loader
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def elf(bits: int = 64, order: str = '<', alignment: int = 16384,
        machine: int = 183, offset: int = 0, address: int = 0) -> bytes:
    """Construct one small ELF containing one PT_LOAD segment."""
    ident = b'\x7fELF' + bytes([2 if bits == 64 else 1, 1 if order == '<' else 2, 1]) + bytes(9)
    wide = bits == 64
    header_size, entry_size = (64, 56) if wide else (52, 32)
    header = struct.pack(order + ('HHIQQQIHHHHHH' if wide else 'HHIIIIIHHHHHH'),
                         3, machine, 1, 0, header_size, 0, 0,
                         header_size, entry_size, 1, 0, 0, 0)
    values = (1, 5, offset, address, 0, 128, 256, alignment) if wide else (
        1, offset, address, 0, 128, 256, 5, alignment)
    segment = struct.pack(order + ('IIQQQQQQ' if wide else 'IIIIIIII'), *values)
    return (ident + header + segment).ljust(256, b'\0')


class ElfAlignmentTest(unittest.TestCase):
    """Reject false compatibility and malformed/truncated evidence."""

    def test_all_supported_encodings(self) -> None:
        """ELF32/64 and both byte orders parse without host assumptions."""
        for bits in (32, 64):
            for order in ('<', '>'):
                result = AUDIT.inspect_elf(elf(bits, order))
                self.assertEqual(result['status'], 'PASS')
                self.assertEqual(result['elfClass'], bits)

    def test_four_kib_is_failure_not_zip_success(self) -> None:
        """A valid 4 KiB ELF is still unsuitable for the 16 KiB load gate."""
        result = AUDIT.inspect_elf(elf(alignment=4096))
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(result['loadSegments'][0]['alignment'], 4096)

    def test_non_power_of_two_and_incongruent_segments(self) -> None:
        """Invalid alignment and mismatching mapping offsets cannot pass."""
        for data in (elf(alignment=24576), elf(address=4096)):
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(data)

    def test_bad_or_truncated_headers(self) -> None:
        """Missing bytes, unknown versions/classes/orders are rejected."""
        for data in (b'', b'not ELF', elf()[:40], elf()[:80]):
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(data)
        for offset, value in ((4, 3), (5, 0), (6, 2)):
            data = bytearray(elf()); data[offset] = value
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(bytes(data))

    def test_header_and_segment_bounds(self) -> None:
        """Reject wrong entry sizes, counts, offsets and file/memory sizes."""
        for offset, fmt, value in ((54, 'H', 1), (56, 'H', 65535), (32, 'Q', 4096),
                                   (64 + 32, 'Q', 257), (64 + 40, 'Q', 64)):
            data = bytearray(elf()); struct.pack_into('<' + fmt, data, offset, value)
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(bytes(data))

    def test_no_load_segments_is_not_success(self) -> None:
        """An empty/non-load table must not vacuously pass."""
        data = bytearray(elf()); struct.pack_into('<I', data, 64, 0)
        with self.assertRaises(ValueError):
            AUDIT.inspect_elf(bytes(data))

    def test_non_load_memory_size_has_no_load_semantics(self) -> None:
        """A valid NOTE need not have a PT_LOAD-style memory-size field."""
        data = bytearray(elf()); struct.pack_into('<H', data, 56, 2)
        struct.pack_into('<IIQQQQQQ', data, 120, 4, 0, 200, 0, 0, 16, 0, 4)
        self.assertEqual(AUDIT.inspect_elf(bytes(data))['status'], 'PASS')

    def test_prefix_uses_declared_file_length(self) -> None:
        """Large libraries need only bounded program-header reads."""
        data = bytearray(elf()); struct.pack_into('<Q', data, 96, 10000000)
        struct.pack_into('<Q', data, 104, 10000000)
        self.assertEqual(AUDIT.inspect_elf(bytes(data), 10000000)['status'], 'PASS')

    def test_zip_reports_every_library_and_machine_mismatch(self) -> None:
        """One bad library prevents an aggregate PASS; no extraction occurs."""
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / 'synthetic.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('lib/arm64-v8a/good.so', elf())
                archive.writestr('lib/arm64-v8a/old.so', elf(alignment=4096))
                archive.writestr('lib/x86_64/wrong.so', elf())
                archive.writestr('lib/arm64-v8a/broken.so', b'bad')
            report = AUDIT.audit_apk(apk)
            self.assertEqual(report['status'], 'FAIL')
            self.assertEqual(len(report['libraries']), 4)
            self.assertEqual(sorted(row['status'] for row in report['libraries']),
                             ['ERROR', 'ERROR', 'FAIL', 'PASS'])
            self.assertEqual(report['zipAlignment'], 'NOT_CHECKED')

    def test_empty_duplicate_and_unknown_native_paths(self) -> None:
        """Ambiguous ZIP entries and unknown ABIs fail closed."""
        with tempfile.TemporaryDirectory() as directory:
            for names in ([], ['lib/unknown/a.so'], ['lib/arm64-v8a/a.so'] * 2):
                apk = Path(directory) / 'synthetic.apk'
                with zipfile.ZipFile(apk, 'w') as archive:
                    for name in names:
                        archive.writestr(name, elf())
                with self.assertRaises(ValueError):
                    AUDIT.audit_apk(apk)

    def test_output_is_new_and_inside_report_directory(self) -> None:
        """Preserve earlier measurements; reject symlink/path escapes."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); reports = root / 'docs' / 'reports'; reports.mkdir(parents=True)
            output = reports / 'new.json'
            AUDIT.write_report({'status': 'PASS'}, output, root)
            with self.assertRaises(FileExistsError):
                AUDIT.write_report({}, output, root)
            for path in (root / 'outside.json', reports / '..' / 'outside.json'):
                with self.assertRaises(ValueError):
                    AUDIT.write_report({}, path, root)


if __name__ == '__main__':
    unittest.main()
