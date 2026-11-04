"""Pure public deployment identity; no settings, credentials or database imports."""

import re
from typing import Literal, TypedDict


class DeploymentIdentity(TypedDict):
    """Public metadata used to verify the event-sync contract deployment."""

    event_time_contract_version: Literal[1]
    build_revision: str | None
    deployment_provider: Literal['vercel', 'unreported']


def deployment_identity(revision: str | None, vercel_flag: str | None) -> DeploymentIdentity:
    """Expose only a full Git SHA and contract identifier, never arbitrary env text."""
    return {
        'event_time_contract_version': 1,
        'build_revision': revision if revision and re.fullmatch(r'[a-f0-9]{40}', revision) else None,
        'deployment_provider': 'vercel' if vercel_flag == '1' else 'unreported',
    }
