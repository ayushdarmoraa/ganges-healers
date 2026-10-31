"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Search, ShoppingCart, UserRound } from "lucide-react";
import { BookSessionButton } from "./BookSessionButton";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { SearchPalette } from "./SearchPalette";
import { UserMenu, type UserMenuMode } from "./UserMenu";
import { useCart } from "@/components/store/CartProvider";
import { useSearch } from "@/lib/search/useSearch";
import { searchSuggestionGroups } from "@/lib/search/results";

export interface NavigationV2NavbarProps { className?: string }
type Panel = 'search' | 'account' | 'mobile' | null;
const primary = [{ label: 'Programs', href: '/programs' }, { label: 'Services', href: '/services' }, { label: 'Audio', href: '/audio' }, { label: 'Community', href: '/community' }, { label: 'Courses', href: '/courses' }];
const browseLinks = { title: 'Browse', items: [{ label: 'Services', href: '/services' }, { label: 'Programs', href: '/programs' }, { label: 'Courses', href: '/courses' }, { label: 'Audio', href: '/audio' }, { label: 'Store', href: '/store' }, { label: 'Blog', href: '/blog' }] };

/** Mounted application header: one search surface, live session actions, and the existing cart/notification providers. */
export function Navbar({ className }: NavigationV2NavbarProps) {
  const { data: session, status: sessionStatus } = useSession();
  const { totalItems, isOpen: cartOpen, setIsOpen: setCartOpen } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const user = sessionStatus === 'authenticated' ? session?.user : null;
  const ownerId = user?.id || null;
  const owner = useRef(ownerId);
  const accountEpoch = useRef(0);
  const logoutInFlight = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const activePanel = useRef<Panel>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const searchId = useId();
  const accountId = useId();
  const cartDescriptionId = useId();
  const search = useSearch(query, panel === 'search');
  const changePanel = useCallback((next: Panel) => {
    activePanel.current = next;
    setPanel(next);
    if (next !== 'search') setQuery('');
  }, []);
  const closePanels = useCallback(() => { changePanel(null); setCartOpen(false); }, [changePanel, setCartOpen]);
  useEffect(() => { closePanels(); }, [pathname, closePanels]);
  useEffect(() => {
    const previousOwner = owner.current;
    owner.current = ownerId; accountEpoch.current++;
    if (previousOwner && previousOwner !== ownerId) closePanels();
    setLogoutError(null); setLogoutPending(false);
  }, [ownerId, closePanels]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || cartOpen || activePanel.current === 'account' || activePanel.current === 'mobile') return;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault(); opener.current = document.activeElement as HTMLElement | null; changePanel('search');
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [cartOpen, changePanel]);
  const open = (next: Exclude<Panel, null>, event: MouseEvent<HTMLButtonElement>) => { opener.current = event.currentTarget; setCartOpen(false); changePanel(next); };
  const restoreFocus = () => { if (!activePanel.current && opener.current?.isConnected) opener.current.focus(); };
  const submitSearch = () => { const term = query.trim(); if (term.length < 2) return; changePanel(null); router.push(`/search?q=${encodeURIComponent(term)}`); };
  async function logout() {
    if (!ownerId || logoutInFlight.current) return;
    const uid = ownerId;
    const epoch = accountEpoch.current;
    logoutInFlight.current = true; setLogoutPending(true); setLogoutError(null);
    try {
      const result = await signOut({ redirect: false, redirectTo: '/' });
      if (!result || typeof result.url !== 'string' || !result.url) throw new Error('Sign-out was not confirmed');
      // Auth.js v5's client does not inspect HTTP status; verify cookie-backed state before claiming success.
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('Session could not be checked');
      const remaining: unknown = await response.json();
      if (remaining !== null && (typeof remaining !== 'object' || Array.isArray(remaining) || Object.keys(remaining).length !== 0)) throw new Error('A session is still active');
      if (owner.current && (owner.current !== uid || accountEpoch.current !== epoch)) return;
      closePanels(); router.replace('/'); router.refresh();
    } catch {
      if (owner.current === uid && accountEpoch.current === epoch) setLogoutError('Sign out could not be confirmed. Please try again.');
    } finally {
      logoutInFlight.current = false;
      if (owner.current === uid || owner.current === null) setLogoutPending(false);
    }
  }
  const controlClass = 'relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-ring disabled:opacity-50';
  const searchControl = <button type="button" className={controlClass} aria-label="Open search" aria-haspopup="dialog" aria-expanded={panel === 'search'} aria-controls={panel === 'search' ? searchId : undefined} onClick={event => open('search', event)}><Search className="size-5" aria-hidden="true" /></button>;
  const accountControl = <button type="button" className={controlClass} aria-label="Open user menu" aria-haspopup="dialog" aria-expanded={panel === 'account'} aria-controls={panel === 'account' ? accountId : undefined} disabled={sessionStatus === 'loading'} onClick={event => open('account', event)}><UserRound className="size-5" aria-hidden="true" /></button>;
  const cartControl = <button type="button" className={controlClass} aria-label="Open cart" aria-describedby={cartDescriptionId} aria-haspopup="dialog" data-cart-count={totalItems} onClick={() => { changePanel(null); setCartOpen(true); }}><ShoppingCart className="size-5" aria-hidden="true" />{totalItems > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{totalItems > 99 ? '99+' : totalItems}</span>}</button>;
  const notificationControl = ownerId ? <NotificationBell closeWhen={panel !== null || cartOpen} /> : null;
  const items = primary.map(item => ({ ...item, active: pathname === item.href || pathname?.startsWith(`${item.href}/`) }));
  const mode: UserMenuMode = !ownerId ? 'guest' : user?.role === 'ADMIN' ? 'admin' : user?.role === 'HEALER' ? 'healer' : 'logged-in';
  const dashboard = mode === 'admin' ? '/admin' : mode === 'healer' ? '/healer' : '/dashboard';
  const mobileFooter = <div className="flex flex-col gap-3 text-sm">{sessionStatus === 'loading' ? <p role="status">Loading account…</p> : ownerId ? <>
    <Link href={dashboard} onClick={() => changePanel(null)} className="underline focus-ring">{mode === 'admin' ? 'Admin dashboard' : mode === 'healer' ? 'Healer dashboard' : 'Dashboard'}</Link>
    <Link href="/dashboard/settings" onClick={() => changePanel(null)} className="underline focus-ring">Settings</Link>
    <button type="button" disabled={logoutPending} onClick={() => void logout()} className="rounded border p-2 text-left focus-ring disabled:opacity-50">{logoutPending ? 'Signing out…' : 'Sign out'}</button>{logoutError && <p role="alert" className="text-destructive">{logoutError}</p>}
  </> : <><Link href="/auth/signin" onClick={() => changePanel(null)} className="underline focus-ring">Sign in</Link><Link href="/register" onClick={() => changePanel(null)} className="underline focus-ring">Create account</Link></>}</div>;
  return <div className={['sticky top-0 z-50', className].filter(Boolean).join(' ')}>
    <span id={cartDescriptionId} className="sr-only">{totalItems} items in your cart</span>
    <DesktopNav items={items} searchControl={searchControl} notificationControl={notificationControl} cartControl={cartControl} userControl={accountControl} ctaHref="/services" />
    <div role="navigation" aria-label="Mobile header controls" className="flex items-center justify-between gap-2 border-b bg-background px-4 py-3 lg:hidden">
      <button type="button" className="shrink-0 rounded-md px-3 py-2 text-sm focus-ring" aria-label="Open navigation menu" onClick={event => open('mobile', event)}>Menu</button>
      <div className="flex min-w-0 items-center gap-1"><BookSessionButton size="sm" href="/services" className="hidden sm:inline-flex">Book a Session</BookSessionButton>{searchControl}{cartControl}{accountControl}{notificationControl}</div>
    </div>
    <MobileNav open={panel === 'mobile'} onOpenChange={value => changePanel(value ? 'mobile' : null)} primaryItems={items.slice(0, 4)} secondaryItems={[items[4], { label: 'Blog', href: '/blog' }, { label: 'Store', href: '/store' }, ...(ownerId ? [{ label: 'Notifications', href: '/dashboard/notifications' }] : [])]} footerContent={mobileFooter} ctaHref="/services" />
    <SearchPalette id={searchId} open={panel === 'search'} onOpenChange={value => changePanel(value ? 'search' : null)} query={query} onQueryChange={setQuery} onSubmit={submitSearch} onCloseFocus={restoreFocus} quickLinks={browseLinks} resultGroups={search.results ? searchSuggestionGroups(search.results) : []} loading={search.status === 'loading'} error={search.status === 'error'} onRetry={search.retry} viewAllHref={`/search?q=${encodeURIComponent(query.trim())}`} />
    <UserMenu id={accountId} open={panel === 'account'} onOpenChange={value => changePanel(value ? 'account' : null)} onCloseFocus={restoreFocus} mode={mode} name={user?.name || (ownerId ? 'Your account' : 'Welcome')} email={user?.email || undefined} image={user?.image} avatarFallback={user?.name?.trim().slice(0, 1).toUpperCase() || 'U'} membershipBadge={user?.vip === true ? 'VIP member' : undefined} loading={sessionStatus === 'loading'} onLogout={() => void logout()} logoutPending={logoutPending} logoutError={logoutError} />
  </div>;
}
export default Navbar;
