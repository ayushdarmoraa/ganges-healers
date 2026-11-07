import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BookSessionButton, type BookSessionButtonProps } from "./BookSessionButton";
import { Logo, type LogoProps } from "./Logo";
import { NavItem, type NavItemProps } from "./NavItem";
import { NavSection } from "./NavSection";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface MobileNavItem
  extends Pick<NavItemProps, "label" | "href" | "icon" | "active" | "disabled" | "badge" | "external" | "showDropdownIndicator" | "children"> {
  /** Optional classes applied to the interactive item. */
  linkClassName?: string;
  /** Optional classes applied to the list item wrapper. */
  className?: string;
}

export interface MobileNavProps {
  /** Whether the sheet is open. */
  open?: boolean;
  /** Called when the sheet is closed. */
  onOpenChange?: (open: boolean) => void;
  /** Primary navigation items. */
  primaryItems?: MobileNavItem[];
  /** Secondary navigation items. */
  secondaryItems?: MobileNavItem[];
  /** Optional content rendered before the logo. */
  headerContent?: ReactNode;
  /** Optional logo props. */
  logoProps?: Omit<LogoProps, "children" | "href" | "className">;
  /** Optional CTA label or content. */
  ctaLabel?: ReactNode;
  /** Optional CTA destination. */
  ctaHref?: string;
  /** Optional CTA props. */
  ctaProps?: Omit<BookSessionButtonProps, "children" | "href">;
  /** Placeholder label for the sign-in action. */
  signInLabel?: ReactNode;
  /** Placeholder label for the profile action. */
  profileLabel?: ReactNode;
  /** Session-aware account links/actions supplied by the application header. */
  footerContent?: ReactNode;
  /** Accessible label for the mobile navigation sheet. */
  ariaLabel?: string;
  /** Additional classes for the sheet content. */
  className?: string;
}

/**
 * Mobile-only navigation sheet for Navigation V2.
 *
 * This component renders a calm, full-height navigation experience using the
 * shared Sheet primitive. Its parent supplies session-aware footer actions;
 * destination links close the sheet without duplicating authentication logic.
 */
export function MobileNav({
  open = false,
  onOpenChange,
  primaryItems = [],
  secondaryItems = [],
  headerContent,
  logoProps,
  ctaLabel = "Book a Session",
  ctaHref,
  ctaProps,
  signInLabel = "Sign In",
  profileLabel = "Profile",
  footerContent,
  ariaLabel = "Mobile navigation",
  className,
}: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn("flex h-full w-[85vw] flex-col justify-between gap-0 overflow-y-auto border-r bg-background p-0 sm:max-w-sm", className)}
        aria-label={ariaLabel}
      >
        <SheetHeader className="sr-only"><SheetTitle>{ariaLabel}</SheetTitle><SheetDescription>Browse Ganges Healers and your member notifications.</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between gap-3">
            {headerContent ?? <Logo title="Ganges Healers" href="/" size="md" {...logoProps} />}
          </div>

          <div className="flex flex-col gap-5">
            <NavSection title="Explore" spacing="default">
              <ul className="flex flex-col gap-1">
                {primaryItems.map((item) => (
                  <NavItem
                    key={item.href ?? item.label}
                    onClick={() => onOpenChange?.(false)}
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

            <NavSection title="More" spacing="compact" divider>
              <ul className="flex flex-col gap-1">
                {secondaryItems.map((item) => (
                  <NavItem
                    key={item.href ?? item.label}
                    onClick={() => onOpenChange?.(false)}
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
          </div>

          <div className="flex flex-col gap-3">
            <BookSessionButton href={ctaHref} {...ctaProps}>
              {ctaLabel}
            </BookSessionButton>
          </div>
        </div>

        <div className="border-t border-border/60 p-6">
          {footerContent ?? <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {signInLabel}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {profileLabel}
            </button>
          </div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MobileNav;
