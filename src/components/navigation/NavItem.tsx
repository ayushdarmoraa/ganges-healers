import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface NavItemProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  /** Visible label for the item. */
  label: string;
  /** Link destination. If omitted, the item renders as a non-link control. */
  href?: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Marks the item as the current destination. */
  active?: boolean;
  /** Disables interaction and applies muted styling. */
  disabled?: boolean;
  /** Optional badge displayed to the right of the label. */
  badge?: ReactNode;
  /** Indicates that the item should be treated as an external link. */
  external?: boolean;
  /** Reserved for future dropdown affordance. */
  showDropdownIndicator?: boolean;
  /** Optional content override. */
  children?: ReactNode;
  /** Additional classes for the list item wrapper. */
  className?: string;
  /** Additional classes for the interactive element. */
  linkClassName?: string;
}

/**
 * Reusable navigation item for Navigation V2.
 *
 * The component supports links and non-link controls, active and disabled states,
 * optional iconography, badges, and a reserved dropdown indicator slot while
 * remaining fully accessible and keyboard-friendly.
 */
export function NavItem({
  label,
  href,
  icon,
  active = false,
  disabled = false,
  badge,
  external = false,
  showDropdownIndicator = false,
  children,
  className,
  linkClassName,
  target,
  rel,
  ...anchorProps
}: NavItemProps) {
  const content = (
    <span className="flex items-center gap-2">
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children ?? label}</span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
      {showDropdownIndicator ? (
        <span aria-hidden="true" className="text-muted-foreground">
          ▾
        </span>
      ) : null}
    </span>
  );

  const commonClasses = cn(
    "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "bg-accent text-accent-foreground"
      : "text-foreground hover:bg-accent/70 hover:text-accent-foreground",
    disabled && "pointer-events-none cursor-not-allowed opacity-50",
    linkClassName,
  );

  const sharedProps: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> = {
    ...anchorProps,
    "aria-current": active ? "page" : undefined,
    "aria-disabled": disabled || undefined,
    className: commonClasses,
  };

  return (
    <li className={cn("list-none", className)}>
      {href && !disabled ? (
        <Link
          href={href}
          target={external ? "_blank" : target}
          rel={external ? "noopener noreferrer" : rel}
          {...sharedProps}
        >
          {content}
        </Link>
      ) : (
        <a
          href={href}
          target={external ? "_blank" : target}
          rel={external ? "noopener noreferrer" : rel}
          {...sharedProps}
        >
          {content}
        </a>
      )}
    </li>
  );
}

export default NavItem;
