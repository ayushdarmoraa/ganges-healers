# Client-side Analytics

This project includes a minimal, client-only analytics shim.

Event: booking_modal_open

Properties:
- serviceSlug: string
- programSlug?: string
- source: 'query-openBooking' | 'user-action'
- path: string (window.location.pathname + search)
- ts: number (Date.now())

Emission points:
- Auto-open on Service page when navigating from Program detail CTA with `openBooking=1`:
  - `src/components/features/booking/BookingAutoOpen.tsx` fires with `source: 'query-openBooking'`.
- Manual open when user clicks the Book button on the Service page:
  - `src/components/features/services/HealerBookAction.tsx` fires with `source: 'user-action'`.

Transport:
- Logs to console with tag `[analytics][booking_modal_open]`.
- If `window.dataLayer` exists, `track` pushes `{ event, ...props }` onto it.
- No server calls or DB writes.

Tests:
- `tests/components/ServicePage.booking.analytics.test.tsx` (auto-open path)
- `tests/components/ServicePage.booking.analytics.useraction.test.tsx` (user click path)

---

Event: program_enroll_click

Properties:
- programSlug: string
- serviceSlug?: string
- path: string (window.location.pathname + search)
- ts: number (Date.now())

Emission points:
- `src/components/features/programs/ProgramEnrollSoon.tsx` when a user clicks "I'm interested" on a Program detail page.

Transport:
- Logs to console with tag `[analytics][program_enroll_click]`.
- If `window.dataLayer` exists, `track` pushes `{ event, ...props }` onto it.
- No server calls or DB writes.

---

Event: product_service_cta_click

Properties:
- productSlug: string
- serviceSlug: string
- path: string (window.location.pathname + search)
- ts: number (Date.now())

Emission points:
- Product detail page CTA "Book a session for this product".

Transport:
- Logs to console with tag `[analytics][product_service_cta_click]`.
- If `window.dataLayer` exists, `track` pushes `{ event, ...props }` onto it.
- No server calls or DB writes.
