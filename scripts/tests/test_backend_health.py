"""Read-only deployment-probe tests with fake transport only."""

import importlib.util
import json
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('health_probe', Path(__file__).parents[1] / 'check_backend_health.py')
assert SPEC and SPEC.loader
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)
REVISION = 'b' * 40


class BackendProbeTest(unittest.TestCase):
    """Health alone is insufficient to certify the deployed event fix."""

    def test_matching_identity_is_verified(self) -> None:
        """Only a healthy expected revision plus contract version passes."""
        body = json.dumps({'status': 'ok', 'version': '1.0.0', 'event_time_contract_version': 1,
                           'build_revision': REVISION}).encode()
        result = PROBE.probe('https://api.example.com', REVISION, lambda _url: (200, body))
        self.assertEqual(result['status'], 'VERIFIED')

    def test_reachable_old_wrong_or_malformed_identity_cannot_pass(self) -> None:
        """Reject old deployments, wrong revisions, booleans and malformed JSON."""
        for body in (b'{"status":"ok","version":"1.0.0"}', b'not json', b'[]',
                     json.dumps({'status': 'ok', 'event_time_contract_version': True,
                                 'build_revision': REVISION}).encode(),
                     json.dumps({'status': 'ok', 'event_time_contract_version': 1,
                                 'build_revision': 'c' * 40}).encode()):
            result = PROBE.probe('https://api.example.com', REVISION, lambda _url, payload=body: (200, payload))
            self.assertNotEqual(result['status'], 'VERIFIED')

    def test_offline_http_failure_and_oversized_response_are_safe(self) -> None:
        """Errors are bounded/redacted instead of exposing remote bodies."""
        def offline(_url: str) -> tuple[int, bytes]:
            raise OSError('private connection detail')
        for transport in (offline, lambda _url: (503, b'private server body'),
                          lambda _url: (200, b'x' * 65537)):
            result = PROBE.probe('https://api.example.com', REVISION, transport)
            self.assertEqual(result['status'], 'UNAVAILABLE')
            self.assertNotIn('private', json.dumps(result))

    def test_unsafe_urls_and_revisions_are_rejected_before_network(self) -> None:
        """Do not send credentials or contact arbitrary local/admin endpoints."""
        def unexpected(_url: str) -> tuple[int, bytes]:
            self.fail('Network must not run')
        for url in ('http://api.example.com', 'https://user:password@api.example.com',
                    'https://localhost', 'https://127.0.0.1', 'https://api.example.com/?token=x',
                    'https://api.example.com/admin', 'https://api.example.com:8443'):
            with self.assertRaises(ValueError):
                PROBE.probe(url, REVISION, unexpected)
        with self.assertRaises(ValueError):
            PROBE.probe('https://api.example.com', 'not-a-revision', unexpected)


if __name__ == '__main__':
    unittest.main()
