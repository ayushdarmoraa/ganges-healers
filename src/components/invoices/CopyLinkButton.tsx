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
      className="btn btn-secondary"
      aria-label="Copy invoice link"
    >
      Copy link
    </button>
  );
}
