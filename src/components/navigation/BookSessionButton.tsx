import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type BookSessionButtonSize = "sm" | "md" | "lg";
export type BookSessionButtonVariant = "primary" | "secondary" | "ghost";

export interface BookSessionButtonProps {
  /** Button label or content. */
  children?: ReactNode;
  /** Visual size of the button. */
  size?: BookSessionButtonSize;
  /** Visual variant mapped to the shared button system. */
  variant?: BookSessionButtonVariant;
  /** Shows a loading state and disables interaction. */
  loading?: boolean;
  /** Disables interaction. */
  disabled?: boolean;
  /** Optional leading icon. */
  leadingIcon?: ReactNode;
  /** Optional trailing icon. */
  trailingIcon?: ReactNode;
  /** Makes the button span the available width. */
  fullWidth?: boolean;
  /** When provided, the button renders as a link. */
  href?: string;
  /** Optional click handler. */
  onClick?: () => void;
  /** Additional classes for the button. */
  className?: string;
}

/**
 * Primary conversion CTA for Navigation V2.
 *
 * The component wraps the shared shadcn button primitive and supports both
 * button and link behavior without introducing business logic.
 */
export function BookSessionButton({
  children,
  size = "md",
  variant = "primary",
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  href,
  onClick,
  className,
}: BookSessionButtonProps) {
  const sizeMap: Record<BookSessionButtonSize, "sm" | "default" | "lg"> = {
    sm: "sm",
    md: "default",
    lg: "lg",
  };

  const variantMap: Record<BookSessionButtonVariant, "default" | "secondary" | "ghost"> = {
    primary: "default",
    secondary: "secondary",
    ghost: "ghost",
  };

  const content = (
    <>
      {loading ? <span aria-hidden="true">↻</span> : leadingIcon}
      <span>{children ?? "Book a Session"}</span>
      {trailingIcon}
    </>
  );

  if (href) {
    return (
      <Button
        asChild
        size={sizeMap[size]}
        variant={variantMap[variant]}
        disabled={disabled || loading}
        className={fullWidth ? "w-full" : undefined}
      >
        <Link href={href} onClick={onClick} className={className}>
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={sizeMap[size]}
      variant={variantMap[variant]}
      disabled={disabled || loading}
      onClick={onClick}
      className={[fullWidth ? "w-full" : undefined, className].filter(Boolean).join(" ")}
    >
      {content}
    </Button>
  );
}

export default BookSessionButton;
