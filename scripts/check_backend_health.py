"""Explicit read-only public API deployment verification; no credentials or env files."""

import argparse
import ipaddress
import json
import re
import socket
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

Transport = Callable[[str], tuple[int, bytes]]


class NoRedirect(HTTPRedirectHandler):
    """Never follow a health check to another host or path."""

    def redirect_request(self, req: Request, fp: object, code: int, msg: str,
                         headers: object, newurl: str) -> None:
        """Refuse redirects rather than silently verifying a different endpoint."""
        return


def public_base(url: str) -> str:
    """Accept a plain public HTTPS host without credentials, query or admin paths."""
    value = urlsplit(url)
    host = value.hostname or ''
    if (value.scheme != 'https' or value.username or value.password or value.port not in (None, 443)
            or value.path not in ('', '/') or value.query or value.fragment
            or not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,251}\.[a-z]{2,24}', host)):
        raise ValueError('Use the confirmed public HTTPS API base URL without credentials or paths.')
    return f'https://{host}'


def request_health(url: str) -> tuple[int, bytes]:
    """Check connectivity first, then perform one bounded TLS health read."""
    host = urlsplit(url).hostname
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise OSError('Public connectivity unavailable.')
    with socket.create_connection((host, 443), timeout=5):
        pass
    request = Request(url, headers={'Accept': 'application/json'})
    with build_opener(NoRedirect()).open(request, timeout=10) as response:
        return response.status, response.read(65537)


def probe(base_url: str, expected_revision: str,
          transport: Transport = request_health) -> dict[str, object]:
    """Verify the exact deployed revision/contract; return safe unavailable states."""
    base = public_base(base_url)
    if not re.fullmatch(r'[a-f0-9]{40}', expected_revision):
        raise ValueError('Supply the expected full Git revision.')
    result: dict[str, object] = {
        'version': 1, 'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
        'baseUrl': base, 'expectedRevision': expected_revision, 'status': 'UNAVAILABLE',
        'observedRevision': None, 'eventTimeContractVersion': None,
        'limits': ['Read-only identity check; not database sync, authentication or deployment proof by itself.'],
    }
    try:
        status, body = transport(base + '/healthz')
        if status != 200 or len(body) > 65536:
            return result
        value = json.loads(body)
        if not isinstance(value, dict) or value.get('status') != 'ok':
            return result
        revision, contract = value.get('build_revision'), value.get('event_time_contract_version')
        result['status'] = 'REACHABLE_IDENTITY_UNVERIFIED'
        result['observedRevision'] = revision if isinstance(revision, str) and re.fullmatch(r'[a-f0-9]{40}', revision) else None
        result['eventTimeContractVersion'] = contract if type(contract) is int else None
        if result['observedRevision'] == expected_revision and result['eventTimeContractVersion'] == 1:
            result['status'] = 'VERIFIED'
    except (OSError, ValueError, HTTPError, URLError, TimeoutError):
        pass
    return result


def main() -> int:
    """Write a fresh public-host receipt, refusing overwrite and unsafe destinations."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        public_base(args.base_url)
        if not re.fullmatch(r'[a-f0-9]{40}', args.revision):
            raise ValueError('Supply the expected full Git revision.')
        root = Path(__file__).resolve().parents[1]
        output = args.output.resolve()
        if output.suffix != '.json' or not output.is_relative_to((root / 'docs/reports').resolve()):
            raise ValueError('Choose a fresh JSON path inside docs/reports.')
        # Open exclusively before networking so an existing report is never touched.
        with output.open('x', encoding='utf-8', newline='\n') as stream:
            report = probe(args.base_url, args.revision)
            json.dump(report, stream, indent=2); stream.write('\n')
        print(report['status'])
        return 0 if report['status'] == 'VERIFIED' else 1
    except (ValueError, OSError) as error:
        parser.exit(2, f'Verification unavailable: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
