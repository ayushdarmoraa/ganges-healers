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

The pages require sign-in. Inactive or unknown slugs return a not-found page.
The existing topic API response and authorization remain unchanged. No schema,
migration, environment variables, or dependencies are added.
