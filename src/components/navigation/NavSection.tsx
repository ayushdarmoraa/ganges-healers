import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavSectionSpacing = "compact" | "default" | "spacious";

export interface NavSectionProps {
  /** Optional heading for the section. */
  title?: string;
  /** Optional descriptive text shown beneath the heading. */
  description?: string;
  /** Content rendered inside the section. */
  children?: ReactNode;
  /** Adds a divider between the section content and the surrounding layout. */
  divider?: boolean;
  /** Reserved for future collapsible behavior. Currently rendered as a static section. */
  collapsible?: boolean;
  /** Controls vertical spacing between the heading and content. */
  spacing?: NavSectionSpacing;
  /** Additional classes for the wrapper. */
  className?: string;
  /** Optional aria-label override for assistive technology. */
  ariaLabel?: string;
}

/**
 * Reusable container for grouping navigation items across desktop, mobile,
 * user menus, and other navigation surfaces.
 *
 * The component is intentionally presentational and provides a consistent layout
 * primitive for future navigation implementations without introducing behavior.
 */
export function NavSection({
  title,
  description,
  children,
  divider = false,
  collapsible = false,
  spacing = "default",
  className,
  ariaLabel,
}: NavSectionProps) {
  const spacingClasses = {
    compact: "space-y-2",
    default: "space-y-3",
    spacious: "space-y-4",
  } satisfies Record<NavSectionSpacing, string>;

  return (
    <section
      className={cn("w-full", divider && "border-t border-border pt-3", spacingClasses[spacing], className)}
      aria-label={ariaLabel ?? title}
    >
      {(title || description) ? (
        <div className="space-y-1">
          {title ? (
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2" data-collapsible={collapsible ? "true" : undefined}>
        {children}
      </div>
    </section>
  );
}

export default NavSection;
