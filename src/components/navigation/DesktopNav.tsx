import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BookSessionButton, type BookSessionButtonProps } from "./BookSessionButton";
import { Logo, type LogoProps } from "./Logo";
import { NavItem, type NavItemProps } from "./NavItem";
import { NavSection } from "./NavSection";

export interface DesktopNavItem
  extends Pick<NavItemProps, "label" | "href" | "icon" | "active" | "disabled" | "badge" | "external" | "showDropdownIndicator" | "children"> {
  /** Optional classes applied to the interactive item. */
  linkClassName?: string;
  /** Optional classes applied to the list item wrapper. */
  className?: string;
}

export interface DesktopNavProps {
  /** Navigation items displayed in the center section. */
  items?: DesktopNavItem[];
  /** Optional content shown in the left section before the default logo. */
  leftContent?: ReactNode;
  /** Optional content shown in the right section before the CTA. */
  rightContent?: ReactNode;
  /** Optional logo props. */
  logoProps?: Omit<LogoProps, "children" | "href" | "className">;
  /** Optional CTA label or content. */
  ctaLabel?: ReactNode;
  /** Optional CTA destination. */
  ctaHref?: string;
  /** Optional CTA props mapped to the shared button primitive. */
  ctaProps?: Omit<BookSessionButtonProps, "children" | "href">;
  /** Placeholder label for the search trigger. */
  searchLabel?: ReactNode;
  /** Live search control, replacing the presentation fallback. */
  searchControl?: ReactNode;
  /** Placeholder label for the notification trigger. */
  notificationLabel?: ReactNode;
  /** Live notification control; null hides the utility for signed-out visitors. */
  notificationControl?: ReactNode;
  /** Placeholder label for the user menu trigger. */
  userMenuLabel?: ReactNode;
  /** Live account and cart controls. */
  userControl?: ReactNode;
  cartControl?: ReactNode;
  /** Accessible label for the desktop navigation landmark. */
  ariaLabel?: string;
  /** Additional classes for the outer shell. */
  className?: string;
}

/**
 * Desktop-only navigation shell for Navigation V2.
 *
 * The component provides a sticky, accessible header layout with a logo, a
 * configurable center navigation group, and slots for live search, notifications,
 * account, and cart controls. Presentation fallbacks remain available to other callers.
 */
export function DesktopNav({
  items = [],
  leftContent,
  rightContent,
  logoProps,
  ctaLabel = "Book a Session",
  ctaHref,
  ctaProps,
  searchLabel = "Search",
  searchControl,
  notificationLabel = "Alerts",
  notificationControl,
  userMenuLabel = "Account",
  userControl,
  cartControl,
  ariaLabel = "Desktop navigation",
  className,
}: DesktopNavProps) {
  const defaultLogo = <Logo title="Ganges Healers" href="/" size="md" {...logoProps} />;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 hidden w-full border-b border-border/60 bg-background/95 backdrop-blur-sm lg:block",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center justify-start">
          {leftContent ?? defaultLogo}
        </div>

        <nav aria-label={ariaLabel} className="hidden flex-1 items-center justify-center lg:flex">
          <NavSection className="w-full">
            <ul className="flex items-center justify-center gap-1">
              {items.map((item) => (
                <NavItem
                  key={item.href ?? item.label}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={item.active}
                  disabled={item.disabled}
                  badge={item.badge}
                  external={item.external}
                  showDropdownIndicator={item.showDropdownIndicator}
                  className={item.className}
                  linkClassName={item.linkClassName}
                >
                  {item.children}
                </NavItem>
              ))}
            </ul>
          </NavSection>
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {searchControl !== undefined ? searchControl : <button
            type="button"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open search"
          >
            {searchLabel}
          </button>}

          {notificationControl !== undefined ? notificationControl : <button
            type="button"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open notifications"
          >
            {notificationLabel}
          </button>}

          {cartControl}
          {userControl !== undefined ? userControl : <button
            type="button"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open user menu"
          >
            {userMenuLabel}
          </button>}

          {rightContent ?? (
            <BookSessionButton href={ctaHref} {...ctaProps}>
              {ctaLabel}
            </BookSessionButton>
          )}
        </div>
      </div>
    </header>
  );
}

export default DesktopNav;
