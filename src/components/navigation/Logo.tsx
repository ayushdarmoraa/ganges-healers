import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type LogoSize = "sm" | "md" | "lg";

export interface LogoProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> {
  /** Main brand name shown when no image asset is supplied. */
  title?: string;
  /** Optional supporting text shown beneath the main brand name. */
  tagline?: string;
  /** Visual size for the logo. */
  size?: LogoSize;
  /** Optional image source for a wordmark or logo mark. */
  src?: string;
  /** Accessible alt text for the image variant. */
  alt?: string;
  /** Optional classes applied to the image element when an image is used. */
  imageClassName?: string;
  /** Destination for the logo link. Defaults to the home route. */
  href?: string;
  /** Optional classes for the wrapper. */
  className?: string;
}

/**
 * Reusable brand logo for Navigation V2.
 *
 * Supports a text logo by default, an image wordmark or mark when a src is provided,
 * an optional tagline, multiple sizes, and semantic focus styling for accessibility.
 */
export function Logo({
  title = "Ganges Healers",
  tagline,
  size = "md",
  src,
  alt,
  imageClassName,
  href = "/",
  className,
  ...anchorProps
}: LogoProps) {
  const sizeClasses = {
    sm: {
      title: "text-base font-semibold tracking-tight",
      tagline: "text-xs",
      image: "h-8 w-auto",
    },
    md: {
      title: "text-lg font-semibold tracking-tight",
      tagline: "text-sm",
      image: "h-9 w-auto",
    },
    lg: {
      title: "text-xl font-semibold tracking-tight",
      tagline: "text-sm",
      image: "h-10 w-auto",
    },
  } satisfies Record<LogoSize, { title: string; tagline: string; image: string }>;

  const currentSize = sizeClasses[size];

  return (
    <Link
      href={href}
      aria-label={anchorProps["aria-label"] ?? `${title} home`}
      className={cn(
        "inline-flex items-center gap-3 rounded-md text-foreground transition-colors duration-150 hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...anchorProps}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? title}
          className={cn("shrink-0 object-contain", currentSize.image, imageClassName)}
        />
      ) : (
        <span className="flex flex-col leading-none">
          <span className={cn("text-foreground", currentSize.title)}>{title}</span>
          {tagline ? (
            <span className={cn("mt-1 text-muted-foreground", currentSize.tagline)}>
              {tagline}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );
}

export default Logo;
