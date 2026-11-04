"""Exercise public build identity without loading application settings or a DB."""

import unittest

from backend.app.services.deployment_health import deployment_identity


class DeploymentHealthTest(unittest.TestCase):
    """Missing or forged build metadata must not claim a known deployment."""

    def test_full_vercel_revision_is_public_identity(self) -> None:
        """Return only the allowlisted contract and validated commit fields."""
        self.assertEqual(deployment_identity('a' * 40, '1'), {
            'event_time_contract_version': 1, 'build_revision': 'a' * 40,
            'deployment_provider': 'vercel',
        })

    def test_missing_invalid_or_local_identity_is_explicit(self) -> None:
        """Never leak arbitrary environment text or fabricate a revision."""
        for value in (None, '', 'secret-value', 'a' * 39, 'x' * 40):
            result = deployment_identity(value, None)
            self.assertIsNone(result['build_revision'])
            self.assertEqual(result['deployment_provider'], 'unreported')
            self.assertNotIn('secret', str(result))
