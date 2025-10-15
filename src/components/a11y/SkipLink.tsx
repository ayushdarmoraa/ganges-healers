import Link from 'next/link'

export default function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-3 focus:py-2 focus:rounded"
    >
      Skip to main content
    </Link>
  )
}
