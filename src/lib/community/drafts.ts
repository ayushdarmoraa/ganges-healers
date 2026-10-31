export interface CommunityDraft {
  title: string
  content: string
  topicId: string
  tagIds: string[]
  topicChosen: boolean
}

/** Keep device drafts separate for each signed-in account and originating topic. */
export function communityDraftKey(ownerId: string, topicSlug: string) {
  return `gh-community-draft:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(topicSlug || 'all')}`
}

/** Ignore malformed or incompatible device data instead of filling the composer with it. */
export function parseCommunityDraft(source: string | null): CommunityDraft | null {
  if (!source) return null
  try {
    const value: unknown = JSON.parse(source)
    if (!value || typeof value !== 'object') return null
    const draft = value as Record<string, unknown>
    if (draft.version !== 1 || typeof draft.title !== 'string' || draft.title.length > 200
      || typeof draft.content !== 'string' || draft.content.length > 5000
      || typeof draft.topicId !== 'string' || !Array.isArray(draft.tagIds)
      || draft.tagIds.length > 5 || !draft.tagIds.every(tag => typeof tag === 'string')) return null
    return { title: draft.title, content: draft.content, topicId: draft.topicId, tagIds: [...new Set(draft.tagIds as string[])], topicChosen: draft.topicChosen !== false }
  } catch {
    return null
  }
}
