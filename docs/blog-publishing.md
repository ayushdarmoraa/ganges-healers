# Blog drafting and publication

Open **Manage Articles** from `/admin`, or visit `/admin/blog`. The page layout
and every management API request require a real signed-in actor whose current
database role is `ADMIN`. The current-role guard is shared with community
administration; a synthetic test-mode bypass identity cannot own an audit.

## Write and review

Create an article at `/admin/blog/new`. The form suggests a URL slug from the
title; adjust it before the first save. Slugs normalize to lowercase letters
and numbers separated by single hyphens. After saving, the address is permanent.

New articles always save as **private drafts**, overriding the legacy model's
published default. Draft bodies may be empty; publication requires body text.
Drafts are available only in admin APIs/screens. The editor supports title,
summary, cover URL, and plain-text body. Preview shares the public article's
escaped text renderer: HTML appears as text and never executes.

The summary appears in lists and descriptions. Optional cover URLs must use
HTTPS and the existing configured image hosts. A shared configuration keeps
validation consistent with Next/Image. This workflow does not upload files.

The editor shows unsaved/saved state, warns on browser unload, and confirms
leaving through its Back control or discarding edits. Save explicitly: unsaved
edits are not automatically stored on the server or device. Navigation through
global application links is not intercepted. Saved drafts can be reopened.

## Publish, update, and withdraw

Save a draft, select **Publish**, review its content, and confirm. The article
becomes public in the blog, homepage, global search, and sitemap.

A published article has one live content record. **Save live changes** requires
confirmation and updates that record immediately. There is no separate pending
revision of a live article. Save or discard edits before changing publication
status. **Unpublish** requires confirmation and returns the record to a draft,
preserving text, ID, URL, and audit history. Republish at the same address.

Fresh public ID/slug API reads return 404 after withdrawal, and new page, list,
homepage, search, and sitemap reads exclude the article. Already loaded pages
and copies of previously public text are not revoked.

The existing `createdAt` remains the **Article date**, not a claimed first
publication time. The schema has no separate first-published timestamp or content
revision history. Audits contain actions/field names rather than earlier bodies.

## Manager and recovery

Search title, summary, or body; filter all/draft/published; and paginate metadata
without fetching all full bodies. Only published rows offer public links.
Loading errors offer retry, and failed pagination retains loaded rows. Missing
records and denied access are distinct from temporary errors.

Full editor reads include an opaque saved version. Intervening changes return
`409 ARTICLE_CHANGED`, retaining entered text. **Reload saved version** confirms
discarding unsaved changes; cancelling it preserves both text and recovery.
Duplicate slugs return `409 SLUG_UNAVAILABLE` and can be corrected before saving.

Mutations lock the row and commit article changes and audit records together.
Audit failure rolls back the change, including publication. No-op saves do not
add audit history. Decisions apply to the version actually reviewed.
The same transaction maintains the article's full-text search vector, including
when publishing an older record without one. This also works in schema-only
development/test databases without the migration's search trigger. Already
correct vectors are not rewritten; a no-op save may repair a missing index
without changing editable fields, dates, or audit history.

Public lists read published records directly instead of the old `blog:list`
memory cache. Global search caches other result groups but refreshes blog
matches on every request, ignoring old cached blog payloads. Detail pages and
the sitemap render dynamically; successful blog/search APIs use `no-store`.
Existing public JSON shapes and ID-or-slug lookups remain compatible.

## Management API

`GET|POST|PATCH /api/admin/blog` return `Cache-Control: private, no-store`.

- GET without `id`: `{ success, data, counts, nextCursor }` metadata pages.
  Filters: `status=all|draft|published`, `q` up to 200 characters, integer
  `limit=1..100` (default 25), and cursor. GET with `id` returns the full saved
  article/version, including drafts; missing records return 404.
- POST: title (1–200 trimmed characters), slug (1–100), optional body (up to
  50,000), `excerpt` (up to 500), and `imageUrl` (up to 2,000). It always
  creates an unpublished draft and returns `201 { success, data }`.
- PATCH: `{ id, version, changes }`, supporting title, body, excerpt, image URL,
  and published state. Omitted fields stay unchanged; slugs are immutable.
  Invalid/empty changes return 400. Empty published content returns
  `400 CONTENT_REQUIRED`. Success: `{ success, data, idempotent }`.

No schema, dependency, environment variable, deployment, or deletion endpoint
is added. Reverting the feature restores earlier screens/APIs while keeping
article records valid. Visibility changes already made are not undone.

Coverage: `blog.admin.api.test.ts`, `BlogPublishing.test.tsx`,
`blog.publishing.api.test.ts`, and `blog.publishing.spec.ts`. PostgreSQL covers
partial edits, concurrency, audit rollback, stable links, private drafts, warm
search caches, and pagination. The browser flow follows draft → preview →
publish → live edit → withdraw → republish with an anonymous reader. Both use
the existing isolated test runner; production data is not required.
