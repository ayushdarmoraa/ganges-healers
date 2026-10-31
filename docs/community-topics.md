# Community browsing and posting

Signed-in members can open `/community/topics` from **Explore Topics** on the
Community page. The directory shows active topics and their descriptions in the
configured order. Each card opens `/community/topic/[slug]`.

A topic page shows its name and description, links to existing discussions, and
loads subsequent posts through the existing authenticated
`GET /api/community/posts?topicId=...&cursor=...` API. Pinned cards, author details,
tags, likes, and comment counts use the same card as the main Community feed.
Pagination keeps existing posts visible on failure and allows retrying. Empty
topics invite members to start a discussion; publishing keeps the existing VIP
requirement.

Both **Create Post** links on a topic page open
`/community/create?topic=[slug]`. The composer selects that active topic after
loading the available choices. Authors may change the topic or choose no topic.
An unknown or inactive URL topic produces a clear notice rather than selecting
another topic. Topic loading failures retain the draft and offer a retry; missing
tags do not prevent publishing.

The publishing API now returns `400` with `code: TOPIC_UNAVAILABLE` when a supplied
topic ID is missing or inactive. The composer refreshes the choices and retains
the draft in that case. Successful publishing keeps the existing `201` response
and opens the new discussion.

## Write, preview, and recover a draft

The composer has **Write** and **Preview** views. Preview renders plain text,
topic, and tags without publishing or sending the draft to the server. Switching
views preserves the form.

Edits are saved in this browser’s local storage, separately for the signed-in
account and originating topic. A saved draft is restored on return. The status
line states whether a draft was restored or saved, or whether device storage is
unavailable. Publishing remains usable when storage is blocked. A successful
publication clears the saved draft; **Discard draft** asks for confirmation and
clears the editor and device copy. These drafts are device-local and are not
synced between browsers or devices.

## My discussions, tags, and feed controls

- `/community/mine` lists only the signed-in account’s non-deleted posts. The
  server applies `mine=1` using the authenticated user ID; callers cannot select
  another owner by passing a user ID.
- `/community/tags` lists available tags. `/community/tag/[slug]` shows the
  matching discussions; unknown tags return not-found. Topic and tag badges on
  cards and discussion pages link directly to their browsing pages.
- The main, topic, tag, and personal feeds share search, latest/most-liked/
  most-commented ordering, pagination, retry, empty, and signed-out states.
  Changing a filter resets the cursor and aborts stale requests. Searching keeps
  the account/topic/tag restrictions, with a limit of 200 full-text hits within
  that scope. Engagement order may change while people add reactions or replies.
- Pinned posts are shown first for the initial latest page and excluded from
  later regular pages. Sorting has an ID tie breaker; the client also deduplicates
  repeated IDs when appending a page.
- Publishing validates supplied tag IDs, deduplicates repeated selections, and
  returns `400` with `code: TAG_UNAVAILABLE` for missing tags. The composer
  refreshes the choices while preserving text.

The pages require sign-in. Inactive or unknown slugs return a not-found page.
The existing topic API response and authorization remain unchanged. No schema,
migration, environment variables, or dependencies are added by these community features.

## Moderation workspace

Admins can open **Community Moderation** from `/admin` or visit
`/admin/community`. The server page and every moderation API request check the
signed-in actor and their current database role. The existing guarded test
runtime must also have a real admin session for moderation; a synthetic bypass
identity cannot own a decision or audit record.

The workspace provides three views:

- **Reports**: filter pending, reviewed, dismissed, or all reports; narrow to
  discussions/comments; search the reason, reporter name, or target ID; and
  load additional pages. Read full content before confirming a decision.
  **Hide & resolve** hides the target and reviews all its pending reports.
  **Dismiss report** and **Mark reviewed** close only the selected report while
  preserving current visibility. Review history records the moderator and time.
- **Content**: browse visible/hidden discussions or comments, search their text,
  hide content directly, restore eligible removals, and pin/unpin discussions.
  Comments under hidden discussions belong to the hidden view even if the
  comments were not individually removed.
- **Metrics**: visible and hidden content totals, activity, VIP participation,
  and pending reports. Visible-comment metrics exclude hidden parent discussions.

Every action requires confirmation. The request includes the content version
that was reviewed; an intervening edit returns `409` and asks the moderator to
refresh. Conflicting completed report decisions also return `409`. A retry of
the same completed report decision by its moderator returns the saved outcome
without hiding content that was subsequently restored.

Hiding is reversible soft deletion. Restoration is available only when a
different actor removed the author's content and the removal actor is known.
Author deletions and unknown historical removals cannot be restored here.
Restore a hidden parent discussion before restoring its separately hidden
comment. Restoring a discussion does not revive independently removed comments.
Any legacy pending reports must be closed before restoration. Closed reports
remain in history after restoration. Pinning is limited to visible discussions;
a hidden pinned discussion can still be unpinned.

## Reporting and member visibility

Signed-in members can report another member's visible discussion or comment.
The report reason must contain 5–500 characters after trimming. A pending
report disables that target's report button as **Reported**, including after
reopening the discussion. Only the current member's pending-report state is
returned; other reporters and their reasons are not exposed in member views.
After a report is closed, the member may report the content again if needed.

Duplicate simultaneous submissions return one `201` and one `409`. Hidden
targets, including comments under hidden discussions, return `404`; self-reports
return `400`. Discussion pages distinguish unavailable content from sign-in and
temporary loading failures. Once hidden, discussions are excluded from member
feeds and direct reads, and new likes/comments are rejected.

## Transaction boundaries and verification

Reporting, moderation, new comments, and like toggles use the same PostgreSQL
transaction locks. Lock order is parent discussion first, then comment. Row
locks also protect the target while a moderation decision commits. Visibility,
affected report statuses, and the decision's audit record commit together. An
audit write failure fails the decision rather than leaving an unaudited change.
Reports/decisions do not call external services. Optional comment/like
notification failures do not turn an already committed member interaction into
an apparent failed write.

The report deduplication guarantee applies to application writers participating
in this lock protocol; it is not a new database unique constraint. External
writers must use the same protocol. Existing duplicate reports are retained;
hiding resolves all pending reports for their target.

Focused coverage lives in `community.moderation.test.ts`,
`community.admin.guard.test.ts`, `community.admin.api.test.ts`,
`CommunityModeration.test.tsx`, and `CommunityReporting.test.tsx`. The integration
suite `community.moderation.api.test.ts` exercises real PostgreSQL concurrency,
public visibility, queue pagination, content filters, and metrics. The browser
suite `community.moderation.spec.ts` follows member report → admin review →
hide → restore → pin, using separate isolated accounts. Database/browser suites
use the existing dedicated test-database runner; no production data is required.

Implementation extends the existing moderation API/page and member routes.
The transaction service is separate so reports and member interactions can share
the lock order. The admin guard centralizes current-role/real-actor checks; the
client workspace is separate from its server authorization boundary. These are
wired into the existing routes, with no dependencies or schema migrations.
Reverting the moderation commit restores the previous UI/API; existing report
history and soft deletions remain valid data and are not automatically undone.
