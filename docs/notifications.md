# Notifications inbox and delivery

Signed-in members can open `/dashboard/notifications` through the notification bell or account navigation. The inbox has read-status and activity-type filters, title/message search, stable cursor pagination, individual read/unread controls, and account-wide mark-all-as-read. The bell uses the existing Navigation V2 notification panel with working actions and a link to the inbox.

The root layout mounts `components/navigation/Navbar.tsx`. Both its desktop and mobile headers use the live bell; the mobile menu includes the member inbox link and closes on navigation. The older `components/navbar.tsx` is not the mounted application header. Tests cover the mounted navigation composition as well as the inbox and bell in isolation.

## Account isolation and state

Every list, count, cursor lookup, and write uses the authenticated session's user ID. A supplied `userId` query parameter cannot select another account. Missing and unowned notification IDs/cursors produce the same 404. Responses use `Cache-Control: private, no-store`.

One provider inside `SessionProvider` shares the server-confirmed summary between the bell and inbox. It clears prior-account data and aborts old reads when the account changes. Late mutations from an earlier account generation are ignored, including an A → B → A switch. No counter is decremented before a successful response. Failed writes display an error and leave the saved state unchanged.

New clients include their rendered `ownerId` with mutations. The server rejects a different current session with 409 `SESSION_CHANGED` before writing. Empty legacy individual PATCH requests still mark the authenticated account's owned notification as read. Bulk read always requires the expected account ID. A 401, 403, or mismatched response owner clears private rows and offers sign-in/session refresh.

## API contracts

`GET /api/notifications` retains the original `notifications` and `unreadCount` keys. Additive keys are `ownerId` and `nextCursor` (null at the end).

| Parameter | Values |
| --- | --- |
| `status` | `all` (default), `unread`, `read` |
| `type` | `all` (default), `community_comment`, `community_like`, `other` |
| `q` | Trimmed title/message search, up to 200 characters, case insensitive |
| `limit` | Integer 1–100, default 30; full inbox requests 25 |
| `cursor` | Last returned owned ID; results order by creation time descending, then ID descending |

`unreadCount` always covers the entire owned account, regardless of filters or loaded pages. Invalid filters return 400. Unknown/unowned cursors return 404.

`PATCH /api/notifications/[id]/read` accepts `{ "read": true, "ownerId": "current-account-id" }` or `read: false`. An empty body retains legacy mark-read behavior. Successful responses retain `ok: true`, adding `ownerId` and fresh `unreadCount`. Repeating the same action is safe.

`PATCH /api/notifications` requires `{ "action": "readAll", "ownerId": "current-account-id" }`. It returns `ok`, `ownerId`, `updated`, and a fresh `unreadCount`. The update affects **all currently owned unread rows**, including rows outside the selected filters and loaded pages. Notifications inserted after that update remain unread; a fresh count can therefore be nonzero. It is not a promise to mark only rows the member has already viewed.

Both PATCH endpoints reject unknown body keys and malformed JSON with 400. Session/account mismatches return 409 with `code: SESSION_CHANGED`. Individual missing/unowned rows return 404. Server failures return safe errors without exposing internal diagnostics.

## Reliable persistence and live updates

Community comments and new likes call `deliverNotification`. Interacting with your own post, unliking, and rejected hidden-post interactions do not generate notifications.

- With an available queue, the producer gives the job a stable `notificationId`; the worker persists through `storeNotification`.
- When enqueue explicitly reports Redis unavailable, the same helper persists inline before emitting. Redis is optional for inbox delivery.
- A thrown enqueue error can mean acceptance is uncertain. It does **not** trigger a second inline submission. The existing community warning records the failed notification attempt while preserving the successful comment/like. There is no transactional outbox or guaranteed delivery across queue/database failures in this batch.
- Retried jobs with a producer ID upsert the same row, preserve its read state, and verify account/content identity before emitting. Older queued jobs without an ID remain supported but retain their prior best-effort retry semantics.
- Persistence happens before the optional socket event. Socket failures do not undo the database row. Repeated socket events are refresh hints, not additional unread increments.

The shared provider refreshes on focus, return to a visible tab, and every 60 seconds while visible. Same-account read actions notify other tabs via `BroadcastChannel` when supported. The inbox preserves loaded history during background summary refreshes and offers “Show latest” for new unfiltered activity. Read-state actions intentionally refresh the current filtered list from its first page.

Socket delivery is optional. The custom server (`pnpm start:custom`) verifies actual Auth.js session cookies, including secure/chunked cookies, derives the room from that verified token, rejects foreign browser origins, and disconnects at token expiry. A client-supplied user ID is ignored. There is no test-mode authentication bypass. `NEXT_PUBLIC_SITE_URL` must match the browser origin (default `http://localhost:3000`); the auth secret is the application's existing `AUTH_SECRET` or `NEXTAUTH_SECRET`.

Standard Next.js/serverless deployments do not host this custom Socket.IO server. A worker in a separate process also cannot emit through another process's in-memory socket singleton. Polling/focus refresh remains active in both cases, so saved rows remain discoverable. Sign-out/account change disconnects the browser socket; like the application's stateless JWT sessions, server-side token revocation before expiry is not added here.

## Scope and verification

No schema, migration, dependency, or environment-secret changes are required. The existing notification model stores no target-resource URL/ID, so the inbox does not guess deep links from message text. “My discussions” provides access to the member's posts; resource-specific notification links can be added with explicit metadata in a later change.

Coverage includes API ownership/validation, confirmed fallback and uncertain enqueue behavior, retry identity, a real local Socket.IO/Auth.js cryptography test, account switching and shared UI state, PostgreSQL pagination/concurrent reads/delivery, and a two-account browser lifecycle. Integration/browser tests use the existing guarded, isolated PostgreSQL CI setup. No live gateway is involved.

Rollback: revert the notification commits. No database rollback is necessary; existing rows remain readable by the legacy bell/API.
