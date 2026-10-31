"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { BookSessionButton } from "./BookSessionButton";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { SearchPalette } from "./SearchPalette";
import { UserMenu } from "./UserMenu";

export interface NavigationV2NavbarProps {
  /** Optional className for the outer wrapper. */
  className?: string;
}

/**
 * Mounted Navigation V2 header. Desktop and mobile surfaces share the live
 * notification provider; existing search and account shells retain their behavior.
 */
export function Navbar({ className }: NavigationV2NavbarProps) {
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user?.id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const desktopItems = [
    { label: "Programs", href: "/programs" },
    { label: "Services", href: "/services" },
    { label: "Audio", href: "/audio" },
    { label: "Community", href: "/community" },
    { label: "Courses", href: "/courses" },
  ];

  const mobilePrimaryItems = [
    { label: "Programs", href: "/programs" },
    { label: "Services", href: "/services" },
    { label: "Audio", href: "/audio" },
    { label: "Community", href: "/community" },
  ];

  const mobileSecondaryItems = [
    { label: "Courses", href: "/courses" },
    { label: "Blog", href: "/blog" },
    { label: "Store", href: "/store" },
    ...(signedIn ? [{ label: "Notifications", href: "/dashboard/notifications" }] : []),
  ];

  return (
    <div className={className}>
      <DesktopNav
        items={desktopItems}
        searchLabel="Search"
        notificationLabel="Alerts"
        notificationControl={signedIn ? <NotificationBell /> : null}
        userMenuLabel="Account"
        ctaLabel="Book a Session"
        ctaHref="/"
        className="w-full"
      />

      <div className="flex items-center justify-between border-b border-border/60 bg-background px-4 py-3 md:hidden">
        <button
          type="button"
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          Menu
        </button>

        <div className="flex items-center gap-2"><BookSessionButton size="sm" href="/">
          Book a Session
        </BookSessionButton>{signedIn && <NotificationBell />}</div>
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        primaryItems={mobilePrimaryItems}
        secondaryItems={mobileSecondaryItems}
        ctaLabel="Book a Session"
        ctaHref="/"
        className="w-full"
      />

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        recentSearches={{
          title: "Recent searches",
          items: [
            { label: "Chakra healing", description: "Programs" },
            { label: "Sound therapy", description: "Services" },
          ],
        }}
        quickLinks={{
          title: "Quick links",
          items: [
            { label: "Programs", description: "Explore offerings" },
            { label: "Book a session", description: "Start your journey" },
          ],
        }}
        popularSearches={{
          title: "Popular searches",
          items: [{ label: "Meditation" }, { label: "Ayurveda" }, { label: "Healing" }],
        }}
      />

      <UserMenu
        open={userMenuOpen}
        onOpenChange={setUserMenuOpen}
        mode="logged-in"
        name="Asha"
        email="asha@example.com"
        membershipBadge="Member"
      />
    </div>
  );
}

export default Navbar;
