# Global Navigation UX Specification

## 1. Product Intent

The navigation system should feel calm, confident, and quietly supportive. It should not draw attention to itself. It should help people move through the experience with ease, confidence, and emotional safety.

The navigation should feel like a trusted guide through a healing journey:
- clear enough to reduce uncertainty
- gentle enough to feel reassuring
- simple enough to avoid cognitive load
- present enough to orient the user without interrupting the experience

## 2. Design Principles

### 2.1 Invisible by design
The navigation should feel like infrastructure, not a feature. It should support the journey without competing with it.

### 2.2 Calm clarity
Every item must have a clear purpose. No decorative navigation. No visual noise. No unnecessary choices.

### 2.3 Progressive disclosure
The navigation should reveal complexity gradually. Primary actions should stay visible; secondary or contextual actions should appear only when needed.

### 2.4 Emotional tone
The experience should feel warm, grounded, and trustworthy. Motion should be soft, not playful or aggressive.

### 2.5 Confidence over novelty
The system should prioritize familiarity, reliability, and ease of recovery over experimental interaction patterns.

## 3. Navigation Architecture

### 3.1 Primary navigation model
The navigation is organized into three levels:
1. Core destinations
2. Utility actions
3. Contextual account actions

### 3.2 Navigation categories
- Brand / Home
- Core journey destinations
- Search
- Notifications
- Account / Profile
- Mobile quick access

### 3.3 Information hierarchy
The order of priority is:
1. Brand
2. Primary journey destinations
3. Search
4. Notifications
5. Account controls

## 4. Desktop Experience

### 4.1 Layout
Desktop navigation is a single, persistent, top-aligned shell.

Structure:
- Left: brand mark and wordmark
- Center: primary navigation items
- Right: search, notifications, account controls

### 4.2 Visual treatment
- Height: 72px
- Background: translucent and softly elevated when scrolling
- Border: subtle and low-contrast
- Spacing: generous but disciplined
- Typography: clear and understated

### 4.3 Behavior
- Stays pinned at the top
- Uses a subtle elevation change when the user scrolls away from the top
- Avoids dramatic shifts in layout
- Maintains a stable anchor point for orientation

### 4.4 Desktop interaction model
- Primary nav items appear as calm text links with a low-contrast underline or indicator
- Active items use a more defined state without becoming heavy
- Hover states are subtle and brief
- The user should never feel that the nav is competing for attention

### 4.5 Desktop spacing
- Horizontal padding: 24px on standard desktop
- Item spacing: 20px between primary destinations
- Utility cluster spacing: 12px between controls

## 5. Tablet Experience

### 5.1 Layout objective
Tablet navigation should feel compact, efficient, and calm. It should preserve the same hierarchy while reducing visual weight.

### 5.2 Layout pattern
- Brand remains left-aligned
- Primary navigation collapses to a shorter set of core destinations
- Search and account controls remain available
- The navigation should not feel cramped or overpacked

### 5.3 Tablet behavior
- The nav remains sticky at the top
- Secondary items may collapse into a compact overflow control when necessary
- The system should avoid showing too many items at once

### 5.4 Tablet spacing
- Horizontal padding: 16px
- Control size remains touch-friendly
- Vertical rhythm remains consistent with desktop

## 6. Mobile Experience

### 6.1 Core principle
Mobile navigation should feel immediate, low-friction, and grounded. It should support quick movement without overwhelming the screen.

### 6.2 Recommended pattern
Use a two-layer mobile experience:
1. A compact persistent top bar for brand, search, and account access
2. A bottom navigation bar for the most important journey destinations

### 6.3 Bottom navigation
The bottom bar should include only the most essential destinations:
- Home
- Programs
- Community
- Account

### 6.4 Secondary mobile navigation
Additional destinations should be available through a refined sheet or drawer that opens from the right or bottom, depending on context.

### 6.5 Mobile visual language
- Rounded, soft controls
- Reduced visual weight
- Stronger tap targets
- Minimal motion and clear states

## 7. Search Experience

### 7.1 Search role
Search should feel like a quiet tool for the user, not a dominant feature. It should help the user reach what they need without friction.

### 7.2 Search entry point
Search should appear as a lightweight, accessible control with a calm icon and clear affordance.

### 7.3 Search interaction model
On tap or focus:
- the field expands gently
- the experience transitions into a focused search surface
- suggestions appear progressively

### 7.4 Search surface behavior
- Open as an overlay or full-width sheet depending on viewport
- Preserve the user’s context while they search
- Allow quick exit with a single clear action

### 7.5 Search states
- Idle: subtle placeholder, calm visual treatment
- Active: focused field with immediate feedback
- Loading: lightweight skeleton or shimmer, no jarring movement
- Success: suggestions presented clearly and calmly
- Empty: gentle empty state with prompt and recovery path
- Error: human, non-alarming message with retry option

### 7.6 Search empty state
If no suggestions are found:
- present a calm message such as “No matches yet”
- offer simple next steps such as browse programs or try a broader term
- avoid empty, dead space

### 7.7 Search micro-interactions
- Input focus should feel immediate and smooth
- Suggestions should appear with understated motion
- Selection should feel decisive and lightweight

## 8. Notifications Experience

### 8.1 Role
Notifications should help people stay informed without feeling interrupted. They should be present but never intrusive.

### 8.2 Entry point
The notification control should be compact and clear, with an unread count shown only when relevant.

### 8.3 Interaction model
- Opens as a lightweight dropdown or sheet
- Presents recent items in a calm, scannable list
- Uses clear grouping and readable spacing

### 8.4 Notification states
- Empty: friendly, reassuring state with no pressure
- Loading: subtle skeleton state
- Error: non-judgmental fallback with retry action
- Read/unread: clearly differentiated without being visually aggressive

### 8.5 Notification empty state
When there are no notifications:
- show a calm, supportive message
- avoid using alarming language
- give the user a clear sense of progress and calm

## 9. User Menu Experience

### 9.1 Purpose
The user menu should feel like a personal place of control, not a generic account panel.

### 9.2 Content structure
The menu should include:
- account overview
- profile or settings
- sign out or session actions
- role-specific shortcuts where appropriate

### 9.3 Visual and interaction behavior
- Opens from a compact avatar or account control
- Feels elevated but not heavy
- Uses clear spacing and a calm hierarchy
- Keeps the most important actions visible without clutter

### 9.4 Menu states
- Closed: visually understated
- Open: calm and structured
- Loading: pending action state with minimal disruption
- Error: clear fallback guidance

## 10. Scroll Behaviour

### 10.1 Desktop and tablet
- The header remains visible while the user is moving upward
- When the user scrolls downward, the header reduces in visual prominence rather than disappearing abruptly
- The transition should feel smooth and intentional

### 10.2 Mobile
- The top bar may compress slightly on downward scroll
- The bottom navigation remains visible but may reduce its visual density if necessary
- The experience should never feel like the user is losing orientation

### 10.3 Scroll thresholds
- No abrupt snapping
- Motion should feel soft and continuous
- The header should preserve context even while adapting to scroll position

## 11. Sticky Behaviour

### 11.1 Sticky header rules
The header should remain sticky across core journey pages but should not feel rigid.

### 11.2 Sticky behaviour principles
- The user should always know where they are
- The header should not cover content unexpectedly
- It should remain lightweight and unobtrusive

### 11.3 Reserved space
The sticky header must leave enough vertical space for content to breathe, especially on mobile.

## 12. Animation Behaviour

### 12.1 Motion philosophy
Motion should feel calm, precise, and deliberate. It should reassure rather than entertain.

### 12.2 Motion characteristics
- Soft easing
- Short duration
- Minimal movement distance
- No bounce or exaggerated overshoot

### 12.3 Recommended timing
- Navigation hover: 120ms to 160ms
- Overlay open/close: 180ms to 240ms
- Sheet transition: 220ms to 260ms
- Search expansion: 180ms to 220ms
- Scroll reveal/hide: 220ms to 280ms

### 12.4 Easing
Use a gentle, human-centered easing curve rather than sharp or elastic curves.

## 13. Hover Behaviour

### 13.1 Hover expectations
Hover states should be subtle and informative, never flashy.

### 13.2 Hover treatment
- Slight color shift
- Mild underline or indicator change
- No large scale movement
- No abrupt contrast changes

### 13.3 Non-hover states
The resting state must remain clear and confident without relying on hover to communicate importance.

## 14. Keyboard Navigation

### 14.1 Keyboard model
The navigation must be fully operable by keyboard without requiring a mouse.

### 14.2 Required behaviors
- Logical tab order from top to bottom
- Visible focus indicators on all interactive elements
- Enter and Space activate controls
- Escape closes open overlays and menus
- Arrow navigation is supported for grouped controls where appropriate

### 14.3 Focus management
- Focus should move into opened menus or sheets predictably
- Focus should return to the triggering control when a menu closes
- Focus should never be lost or trapped unexpectedly

## 15. Accessibility

### 15.1 Standards
The navigation must meet WCAG 2.2 AA standards.

### 15.2 Requirements
- Color contrast must remain strong and legible
- Touch targets must be comfortably sized
- All controls must have accessible names
- Decorative visuals must not interfere with comprehension
- Reduced-motion settings must be respected

### 15.3 Screen reader behaviour
- The header should be announced as a navigational landmark
- Menu and sheet states should be announced clearly
- Search and notification states should provide meaningful status updates

## 16. Loading States

### 16.1 General approach
Loading states should feel lightweight and calm. They should not create anxiety or visual noise.

### 16.2 Search loading
- Use a minimal skeleton or subtle placeholder state
- Avoid large jumps in layout
- Preserve the field’s visual position

### 16.3 Notification loading
- Show a calm skeleton list or lightweight placeholder
- Avoid flashing or abrupt content shifts

### 16.4 Account menu loading
- Show a short, unobtrusive pending state while actions are resolving
- Preserve the current context if possible

## 17. Authentication States

### 17.1 Guest navigation
For guests, the navigation should feel welcoming and low commitment.

Visible priorities:
- Home
- Programs
- Community
- Search
- Sign in or create account

The experience should make it easy to explore before committing.

### 17.2 Logged-in navigation
For authenticated users, the navigation should feel more personal and more useful.

Visible priorities:
- Home
- Core journey destinations
- Search
- Notifications
- Account

The experience should reinforce continuity and progress.

### 17.3 Healer navigation
For healer users, the navigation should feel focused and operational.

Visible priorities:
- Dashboard
- Bookings
- Availability
- Profile

The navigation should support day-to-day work without feeling administrative.

### 17.4 Admin navigation
For admin users, the navigation should feel structured and authoritative.

Visible priorities:
- Overview
- Analytics
- Moderation
- Settings

The navigation should remain calm while clearly communicating system-level responsibility.

## 18. Error States

### 18.1 Navigation error handling
If any navigation-dependent control fails to load:
- do not break the entire shell
- preserve the surrounding layout
- show a clear fallback message
- offer a recovery path such as retry or return home

### 18.2 Search errors
Show a calm, non-disruptive message with a retry action.

### 18.3 Notification errors
If notifications cannot be loaded, surface a minimal error state and avoid blocking the full experience.

### 18.4 Account action errors
If sign-in, sign-out, or account actions fail, communicate the issue clearly and keep the user in control.

## 19. Mobile Gestures

### 19.1 Gesture principles
Gestures should feel intuitive and optional. They should never be required for core navigation.

### 19.2 Recommended gestures
- Swipe down to dismiss a sheet or overlay
- Swipe horizontally between adjacent mobile sections when appropriate
- Tap and hold should not be used for core actions

### 19.3 Gesture feedback
- Motion should be clear but gentle
- The system should provide obvious feedback without being overly dramatic

## 20. Spacing and Rhythm

### 20.1 General spacing approach
Spacing should feel generous and restful. Navigation should not feel crowded.

### 20.2 Rhythm rules
- Consistent vertical rhythm across all states
- Ample padding around controls
- Clear separation between groups of actions
- No unnecessary density in menus or sheets

## 21. Information Hierarchy

### 21.1 Primary information
The user should immediately understand:
- where they are
- where they can go next
- what actions are available

### 21.2 Secondary information
Notifications, account actions, and contextual controls should be present but visually subordinate to the core journey.

### 21.3 Priority hierarchy
1. Core destinations
2. Search and discovery
3. Personal actions
4. Contextual and secondary settings

## 22. Interaction Timing

### 22.1 Response expectations
The navigation should feel responsive without feeling fast or aggressive.

### 22.2 Timing guidance
- Immediate feedback for taps and focus
- Short, soft transitions for expanded surfaces
- Deliberate timing for layer changes or dismissals

## 23. Micro-interactions

### 23.1 Required qualities
Micro-interactions should feel precise, gentle, and reassuring.

### 23.2 Examples
- Selected item state changes with subtle confirmation
- Notification count updates with understated motion
- Menu opening and closing should feel smooth and contained
- Search field focus should feel immediate and purposeful

## 24. Implementation Handoff Notes

Engineers should implement the navigation as a calm, modular system with:
- consistent spacing and layout rules
- clear state handling for guest, authenticated, healer, and admin contexts
- predictable motion timing and easing
- accessible focus and keyboard behavior
- resilient loading, empty, and error states

The navigation should not feel like a product feature. It should feel like a quiet, trusted guide.
