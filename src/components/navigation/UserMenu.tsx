"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NavItem, type NavItemProps } from "./NavItem";
import { NavSection } from "./NavSection";

export type UserMenuMode = "guest" | "logged-in" | "healer" | "admin";
export interface UserMenuItem extends Pick<NavItemProps, "label" | "href" | "active" | "disabled" | "badge" | "external" | "showDropdownIndicator"> {
  children?: ReactNode;
  className?: string;
  linkClassName?: string;
}
export interface UserMenuProps {
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseFocus?: () => void;
  mode?: UserMenuMode;
  name?: string;
  email?: string;
  image?: string | null;
  membershipBadge?: ReactNode;
  avatarFallback?: string;
  sections?: Array<{ title?: string; description?: string; items: UserMenuItem[] }>;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  logoutLabel?: string;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutError?: string | null;
  className?: string;
}

/** Session data and actions come from the navbar; links remain subject to server-side authorization. */
export function UserMenu({
  id, open = false, onOpenChange, onCloseFocus, mode = "logged-in", name = "Guest", email, image,
  membershipBadge, avatarFallback = "U", sections = [], loadingState, emptyState,
  loading = false, empty = false, logoutLabel = "Sign out", onLogout, logoutPending = false, logoutError, className,
}: UserMenuProps) {
  const defaults: NonNullable<UserMenuProps['sections']> = mode === 'guest' ? [
    { title: 'Get started', items: [{ label: 'Sign in', href: '/auth/signin' }, { label: 'Create account', href: '/register' }] },
    { title: 'Explore', items: [{ label: 'Services', href: '/services' }, { label: 'Store', href: '/store' }, { label: 'Blog', href: '/blog' }] },
  ] : [
    ...(mode === 'admin' ? [{ title: 'Admin', items: [{ label: 'Admin dashboard', href: '/admin' }, { label: 'Community moderation', href: '/admin/community' }, { label: 'Manage articles', href: '/admin/blog' }, { label: 'Payments', href: '/admin/payments' }, { label: 'Analytics', href: '/admin/analytics' }] }] : mode === 'healer' ? [{ title: 'Healer workspace', items: [{ label: 'Healer dashboard', href: '/healer' }, { label: 'Healer bookings', href: '/healer/bookings' }, { label: 'Availability', href: '/healer/availability' }, { label: 'Healer profile', href: '/healer/profile' }] }] : []),
    { title: 'My account', items: [{ label: 'Dashboard', href: '/dashboard' }, { label: 'My bookings', href: '/dashboard/bookings' }, { label: 'Orders', href: '/dashboard/orders' }, { label: 'Membership', href: '/dashboard/membership' }, { label: 'Notifications', href: '/dashboard/notifications' }, { label: 'My discussions', href: '/community/mine' }, { label: 'Settings', href: '/dashboard/settings' }] },
  ];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent id={id} className={cn("max-h-[85vh] max-w-sm overflow-y-auto border-0 p-0", className)} aria-label="Your account"
      onCloseAutoFocus={event => { if (onCloseFocus) { event.preventDefault(); onCloseFocus(); } }}>
      <DialogHeader className="sr-only"><DialogTitle>Your account</DialogTitle><DialogDescription>Account information, navigation, and session actions.</DialogDescription></DialogHeader>
      <Card className="gap-0 border-0 shadow-none">
        <CardHeader className="border-b p-5"><div className="flex items-center gap-3"><Avatar className="size-11">{!loading && image && <AvatarImage src={image} alt="" />}<AvatarFallback>{loading ? '…' : avatarFallback}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-semibold">{loading ? 'Loading account…' : name}</p>{!loading && email && <p className="truncate text-sm text-muted-foreground">{email}</p>}{!loading && membershipBadge && <Badge variant="outline" className="mt-1">{membershipBadge}</Badge>}</div></div></CardHeader>
        <CardContent className="space-y-4 p-5">
          {loading ? loadingState ?? <p role="status" className="text-sm">Loading account menu…</p> : empty ? emptyState ?? <p>No account options available.</p> : <nav aria-label="Account shortcuts" className="space-y-4">{(sections.length ? sections : defaults).map((section, index) => <NavSection key={section.title || index} title={section.title} description={section.description}><ul>{section.items.map(item => <NavItem key={item.href || item.label} {...item} onClick={() => onOpenChange?.(false)}>{item.children}</NavItem>)}</ul></NavSection>)}</nav>}
          {logoutError && <p role="alert" className="text-sm text-destructive">{logoutError}</p>}
          {!loading && mode !== 'guest' && onLogout && <Button type="button" variant="outline" className="w-full" disabled={logoutPending} onClick={onLogout}>{logoutPending ? 'Signing out…' : logoutLabel}</Button>}
        </CardContent>
      </Card>
    </DialogContent>
  </Dialog>;
}
export default UserMenu;
