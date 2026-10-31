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
migration, environment variables, or dependencies are added.
