/** Public articles and admin previews share escaped plain-text rendering. */
export default function ArticleBody({ content }: { content: string }) {
  return <div className="prose prose-neutral max-w-none whitespace-pre-wrap break-words">{content}</div>
}
