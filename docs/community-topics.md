# Community topic pages

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

The pages require sign-in. Inactive or unknown slugs return a not-found page.
The existing topic API response and authorization remain unchanged. No schema,
migration, environment variables, or dependencies are added.
