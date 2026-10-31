# Live application navigation

The root layout mounts `src/components/navigation/Navbar.tsx`. Its desktop and mobile controls now use the existing search endpoint, Auth.js session, notification provider, and cart provider. The older `src/components/navbar.tsx` remains a separate legacy component; it is not the root header.

## Search

Open search from either header or with Command-K / Control-K. The shortcut leaves editable fields, an open cart, and other modal navigation surfaces alone. The dialog focuses its input and returns focus to its opener on Escape. Tab and arrow keys browse the suggestion links. Choosing a result closes the dialog; Enter opens `/search?q=...` with the encoded query.

The palette, full results page, and legacy inline bar share `useSearch` and the public result schema. Requests:

- Require at least two trimmed characters, with a 200-character client limit.
- Debounce suggestions by 300 ms; the results page requests immediately.
- Abort when the query changes, the palette closes, or the component unmounts.
- Hide older-query results before effect cleanup and ignore late aborted responses.
- Check HTTP status and validate all seven result groups before displaying success.
- Show distinct loading, empty, and error states, with an explicit retry.

Suggestions cover services, healers, programs, courses, products, blog, and audio. Destinations are constructed from encoded resource IDs/slugs, not a remote `href`. The palette shows up to three suggestions per group. The full results page retains the endpoint's existing per-group limit of ten; it does not add catalog-wide pagination.

Browse shortcuts are curated links. No invented recent/popular searches or persistent search-history storage is added. The existing `/api/search` response envelope, publication filtering, server caching, and error/logging behavior remain unchanged.

## Account and session actions

The account surface displays the current session's name, email, avatar, and role shortcuts. It does not use a sample identity. The VIP label appears only when the session's VIP flag is true; this display is a session snapshot, not a new authorization or entitlement check. Loading and changed-account states remove the previous identity from the open surface.

| Session role | Additional destinations |
| --- | --- |
| Guest | Sign in, create account, public browse links |
| Member or unknown signed-in role | Dashboard, bookings, orders, membership, notifications, discussions, settings |
| Healer | Healer dashboard, bookings, availability, profile, plus member account links |
| Admin | Admin dashboard, community moderation, article management, payments, analytics, plus member account links |

All links point to existing routes. Server-side authorization remains responsible for access; showing a shortcut never grants permission.

Sign out uses the installed Auth.js client's CSRF-aware flow, with `redirect: false` and a fixed local destination. Duplicate submissions are blocked while pending. Because this client version does not inspect the sign-out response's HTTP status, navigation additionally requires a valid returned URL and a successful `/api/auth/session` read showing an empty/null session. A still-active session, failed verification, or malformed result does not produce a success redirect. When the current account remains available, the account surface shows a retryable error. A confirmed sign-out returns home and refreshes the router.

Desktop account controls and the mobile menu share the same sign-out handler. No authentication provider, cookie settings, database safeguards, role gates, test helpers, or credential configuration is changed.

## Cart and booking access

The header shows the existing cart provider's quantity total and opens the existing cart drawer. Quantity changes, removal, persistence across reloads, and checkout access retain their current behavior. The cart remains browser-local and shared across that browser's sessions, as before. Client cart prices remain display values; checkout's existing server pricing and ownership validation remain authoritative.

“Book a Session” leads to `/services`, where the member can choose the service and start the existing booking flow. On narrow phones the booking link is available inside the menu; tablet/desktop headers keep the visible call to action.

## Responsive and accessible controls

- Widths below 1024 px use the compact header/menu; larger screens use desktop navigation.
- Search, account, cart, and signed-in notifications remain available on phones and tablets.
- Search and account surfaces use the existing dialog primitive for Escape, focus containment, and labels. Account links use ordinary navigation semantics rather than an incomplete ARIA menu.
- Opening search, account, the menu, or cart closes an existing notification panel. Route changes and switches away from a known account close navigation surfaces; initial session hydration preserves public search/cart interactions already in progress.
- The mobile sheet has a descriptive title, scrolls at short heights, closes after destination selection, and provides real guest/member account actions.

## Validation and rollback

Focused UI coverage exercises the mounted header, real shared cart state, debounce/cancellation races, stale responses, empty/error recovery, keyboard focus, session changes, role shortcuts, and confirmed/uncertain sign-out outcomes. Pure unit coverage validates public payloads and resource destinations. Browser coverage uses indexed published content, seeded store products, isolated test accounts, and actual Auth.js sign-out on desktop/mobile; it does not submit a payment.

No schema, migration, dependency, or environment-variable changes are needed. Revert the navigation commits to roll back this batch; existing application data is unchanged.
