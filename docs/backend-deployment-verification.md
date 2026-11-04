# Verify the event-sync backend update

## Owner-supplied address, 2026-11-05 (Asia/Manila)

Owner decision: skip backend/deployment work for now because the friend who holds
access is unavailable. Resume only when the owner requests it. The observations
below are a handoff record, not an instruction to continue seeking access now.

The owner supplied `https://lafina-backend-git-main-nblancs-projects.vercel.app`.
The read-only `/healthz` probe returned UNAVAILABLE; a bounded diagnostic confirmed
HTTP 401 (application/json), with no redirect. See
`reports/backend-health-2026-11-05.json`. The expected revision was the tested,
pushed USTP commit ea6358e3e91e1a5c46ed3e5defc5ae3761c2d771; no deployed revision or
contract version could be verified. A 401 alone does not distinguish platform
protection from application authentication.

Both deployment lookup and the authenticated Vercel fetch reported 404 / no access
for the connected account. No existing local vercel/vc CLI was available. Required
next input is Vercel connection access to the actual backend project/team, or a
public production API URL. The supplied environment-file attachment was not read,
in accordance with AGENTS.md. No protection setting, credentials, database or mobile
host was changed. When the owner resumes this work and access is available, use the
verification procedure below.

Owner correction, 2026-11-04: Render was cancelled; PostgreSQL moved to Neon and the
API host may be Vercel. Do not deploy to the former Render service. Neon database
access does not by itself identify the public FastAPI host. Do not put a database
connection string in the mobile client or guess a replacement API URL.

Read-only discovery of the connected Vercel team found a `lafina-wiki` project by
name, and no project matching the original LAFINA-AI/LAFINA repository filter.
This does not establish an API deployment or exclude a service in another account.
No unrelated project was modified, no credentials were requested, and no deployment
or database mutation was performed. Required owner input: the API project's dashboard
link/public HTTPS base URL and an authorized synthetic staging/test-account flow.
The mobile cloudClient still contains the old Render host; change it only after
the replacement API is positively identified and tested. Offline functionality is
independent of this missing cloud connection.

## Prepared code and tests

The omission-aware event contract preserves timezone metadata for old-client title
edits and distinguishes explicit clears. Pure tests run without settings/database:

```powershell
python -m unittest backend.tests.test_event_time_contract_isolated backend.tests.test_deployment_health_isolated
```

Health remains backward compatible and adds a contract version plus public build
revision/provider. The revision comes only from Vercel's automatic Git SHA; invalid
or absent values become null. No settings, connection strings or secret values are
returned. A manual deployment without Git identity will remain unverified.

Once the real API host and expected full Git revision are known:

```powershell
python scripts/check_backend_health.py --base-url https://CONFIRMED-API-HOST --revision EXPECTED-FULL-GIT-SHA --output docs/reports/new-backend-health.json
```

The probe checks public connectivity first, then reads only /healthz with bounded
response size/time, TLS verification and no redirects. It sends no token or student
content. VERIFIED requires healthy status, the expected revision and event-time
contract version 1. An older healthy API is REACHABLE_IDENTITY_UNVERIFIED. Offline,
HTTP and malformed responses are safe unavailable results. A health receipt is not
proof that authentication, Neon connectivity or two-device sync succeeded.

## Controlled deployment and recovery

1. Confirm the correct Vercel project/repository/branch and its existing Neon wiring
   through the platform dashboard. Check variable presence in the dashboard without
   copying values here or pulling/reading environment files. Preserve the previous
   deployment identity. Do not provision another database or replace another project.
2. Deploy the verified LAFINA-USTP commit through the existing project workflow.
   Inspect bounded build/runtime errors. Keep the mobile host unchanged until the
   new API is verified. Do not run the local full app merely to bypass missing access:
   it loads settings and can initialize real database/admin state.
3. Run the public identity probe. In an authorized isolated staging/test account,
   create one synthetic overnight event, edit only its title through a legacy payload,
   verify metadata on a fresh pull, and verify a new-client explicit null clear.
   Also test unauthorized account access and a stale version. Never use student rows.
4. Remove only the exact test rows through normal owned APIs. Record exact observed
   results without tokens, connection URLs, private response bodies or account IDs.
   Change the mobile API host only to the confirmed working base and rerun cloud
   fallback/typed-client tests plus the required project gates.
5. If validation fails, use the platform's existing previous-deployment rollback or
   a forward code fix; preserve data and nullable metadata. Do not downgrade the
   mobile SQLite schema or erase records. Recheck public identity after recovery.

Deployment/live sync are pending until the real API service is identified. No
successful production deployment is claimed by these host tests or this guide.

Reference: [Vercel public system/Git identity variables](https://vercel.com/docs/environment-variables/system-environment-variables). Missing/disabled identity is handled explicitly.
