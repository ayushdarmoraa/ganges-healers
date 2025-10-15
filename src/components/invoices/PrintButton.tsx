'use client'

export default function PrintButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex items-center rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 focus-ring ${className}`}
    >
      Print
    </button>
  )
}
