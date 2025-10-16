'use client';

import * as React from 'react';

export default function CopyLinkButton({ href }: { href: string }) {
  async function onCopy() {
    try {
      const abs = new URL(href, window.location.origin).toString();
      await navigator.clipboard.writeText(abs);
      // simple toast replacement:
      console.log('[copy] invoice link copied:', abs);
      alert('Link copied'); // replace with your toast if you prefer
    } catch {
      alert('Could not copy link');
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium bg-muted hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/60 cursor-pointer"
      aria-label="Copy invoice link"
    >
      Copy link
    </button>
  );
}
