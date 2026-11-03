# ADR-003: bounded Notes pages with a derived rich-text search cache

Date: 2026-11-04. Status: accepted within the owner-authorized CAPSTONE port.

USTP stores HTML and Markdown Notes. Searching raw HTML in SQL misses visible
phrases separated by formatting; loading all bodies into React merely to filter
scales with the entire account. Schema 22 adds notes_search_index, keyed to the
source note ID, owner and SQL-triggered revision, with UTC creation/update times.

Each search call normalizes at most 50 stale bodies using the existing rich-text
and plain-word parsers. UI yields between batches and says results are updating.
UPDATE/DELETE triggers erase cached text, including sync edits and guest rekeys.
The source note remains authoritative. No source body is rewritten and no network
or new package is involved. LIKE escapes wildcard punctuation literally.

Pages contain at most 20 rows by default (hard maximum 50), ordered by pin, custom
order, update timestamp and unique ID. Cursors bind owner, filter and query.
Reordering requires a complete unfiltered collection and checks every captured
revision and the exact live owner-scoped ID set in one transaction before writes.
Partial pages cannot be treated as the entire collection. Refresh recovers changed
collections; retained page callbacks are fenced by account and query lifetime.

The native delivery reader explicitly accepts schemas 20–22. The standalone QA
APK carries this reader and bundled schema-22 JS together, so no older native reader
runs the migration. Future schemas remain rejected.
