'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Loader2, Upload, X, ImagePlus } from 'lucide-react'
import { isAllowedArticleImage, productImageError, PRODUCT_GALLERY_LIMIT } from '@/config/images'

const CHAKRAS = ['Root', 'Sacral', 'Solar Plexus', 'Heart', 'Throat', 'Third Eye', 'Crown']

interface Props {
  formAction: (formData: FormData) => Promise<void | { error?: string }>
}

async function uploadImage(file: File, signal: AbortSignal): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/upload-product-image', { method: 'POST', body: fd, signal })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(res.status === 413 ? 'Images must be 4 MB or smaller.' : typeof data.error === 'string' ? data.error : 'Upload failed')
  }
  const data = await res.json()
  if (typeof data?.url !== 'string' || !data.url || !isAllowedArticleImage(data.url)) throw new Error('Image upload could not be confirmed. Please try again.')
  return data.url
}

export function CreateProductForm(props: Props) {
  const { data: session, status } = useSession()
  if (status === 'loading') return <p role="status">Loading product editor…</p>
  if (status !== 'authenticated' || session?.user?.role !== 'ADMIN' || !session.user.id) return <p role="alert">Sign in as an administrator to create products.</p>
  return <ProductFormFields key={session.user.id} ownerId={session.user.id} {...props} />
}

function ProductFormFields({ formAction, ownerId }: Props & { ownerId: string }) {
  const nativeAction: (data: FormData) => void = formAction
  const formRef = useRef<HTMLFormElement>(null)
  const alive = useRef(true)
  const uploadBusy = useRef(false)
  const saveBusy = useRef(false)
  const generateBusy = useRef(false)
  const requests = useRef(new Set<AbortController>())
  useEffect(() => {
    alive.current = true
    const pending = requests.current
    return () => { alive.current = false; pending.forEach(controller => controller.abort()); pending.clear() }
  }, [])

  // AI input fields
  const [aiCategory, setAiCategory] = useState('')
  const [aiChakra, setAiChakra] = useState('')
  const [aiMaterial, setAiMaterial] = useState('')
  const [aiPurpose, setAiPurpose] = useState('')

  // Generated fields
  const [shortDescription, setShortDescription] = useState('')
  const [longDescription, setLongDescription] = useState('')
  const [spiritualBenefits, setSpiritualBenefits] = useState('')
  const [ritualUse, setRitualUse] = useState('')
  const [consecrationStory, setConsecrationStory] = useState('')
  const [chakraValue, setChakraValue] = useState('')

  // Image upload state
  const [imageUrl, setImageUrl] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [failedImage, setFailedImage] = useState<File | null>(null)
  const [imageDragActive, setImageDragActive] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Gallery upload state
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [failedGallery, setFailedGallery] = useState<File[]>([])
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const imagesBusy = imageUploading || galleryUploading

  async function handleImageUpload(file: File) {
    if (uploadBusy.current || saveBusy.current) return
    const invalid = productImageError(file)
    if (invalid) { setError(invalid); return }
    uploadBusy.current = true
    const controller = new AbortController(); requests.current.add(controller)
    setImageUploading(true)
    setError(''); setNotice(''); setFailedImage(null)
    try {
      const url = await uploadImage(file, controller.signal)
      if (alive.current) setImageUrl(url)
    } catch (err) {
      if (alive.current && !controller.signal.aborted) { setFailedImage(file); setError(err instanceof Error ? err.message : 'Image upload failed') }
    } finally {
      requests.current.delete(controller); uploadBusy.current = false
      if (alive.current) setImageUploading(false)
    }
  }

  async function handleGalleryUpload(files: File[]) {
    if (uploadBusy.current || saveBusy.current || !files.length) return
    if (galleryUrls.length + files.length > PRODUCT_GALLERY_LIMIT) { setError(`Use up to ${PRODUCT_GALLERY_LIMIT} gallery images.`); return }
    const invalid = files.map(productImageError).find(Boolean)
    if (invalid) { setError(invalid); return }
    uploadBusy.current = true
    const controller = new AbortController(); requests.current.add(controller)
    setGalleryUploading(true)
    setError(''); setNotice(''); setFailedGallery([])
    const failed: File[] = []
    try {
      for (const file of files) {
        if (controller.signal.aborted) break
        try {
          const url = await uploadImage(file, controller.signal)
          if (alive.current) setGalleryUrls(previous => [...previous, url])
        } catch {
          if (!controller.signal.aborted) failed.push(file)
        }
      }
      if (alive.current && !controller.signal.aborted && failed.length) {
        setFailedGallery(failed)
        setError(`${failed.length} gallery image${failed.length === 1 ? '' : 's'} could not be uploaded. Successful images are kept; retry the failed images or remove them from this draft.`)
      }
    } finally {
      requests.current.delete(controller); uploadBusy.current = false
      if (alive.current) setGalleryUploading(false)
    }
  }

  function clearDraft() {
    formRef.current?.reset()
    setAiCategory(''); setAiChakra(''); setAiMaterial(''); setAiPurpose('')
    setShortDescription(''); setLongDescription(''); setSpiritualBenefits(''); setRitualUse(''); setConsecrationStory(''); setChakraValue('')
    setImageUrl(''); setFailedImage(null); setGalleryUrls([]); setFailedGallery([])
  }

  async function submitProduct(formData: FormData) {
    if (uploadBusy.current || generateBusy.current || saveBusy.current) return
    if (failedImage || failedGallery.length) { setError('Retry the failed images or remove them from this draft before creating the product.'); return }
    saveBusy.current = true; setSaving(true); setError(''); setNotice('')
    try {
      const result = await formAction(formData)
      if (result?.error) { if (alive.current) setError(result.error); return }
      if (alive.current) { clearDraft(); setNotice('Product created.') }
    } catch {
      if (alive.current) setError('Product could not be created. Your draft is kept; please try again.')
    } finally {
      saveBusy.current = false
      if (alive.current) setSaving(false)
    }
  }

  async function handleGenerate() {
    if (generateBusy.current || saveBusy.current) return
    setError('')
    const title = (formRef.current?.querySelector<HTMLInputElement>('[name="title"]'))?.value || ''
    if (!title || !aiCategory || !aiChakra || !aiMaterial || !aiPurpose) {
      setError('Fill in Title, Category, Chakra, Material, and Purpose before generating.')
      return
    }

    generateBusy.current = true; setGenerating(true); setNotice('')
    const controller = new AbortController(); requests.current.add(controller)
    try {
      const res = await fetch('/api/admin/generate-product-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category: aiCategory,
          chakra: aiChakra,
          material: aiMaterial,
          purpose: aiPurpose,
        }),
        signal: controller.signal,
      })
      if (!alive.current) return

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Generation failed')
        return
      }

      const data = await res.json()
      if (!alive.current) return
      setShortDescription(data.shortDescription || '')
      setLongDescription(data.longDescription || '')
      setSpiritualBenefits(
        Array.isArray(data.spiritualBenefits) ? data.spiritualBenefits.join('\n') : '',
      )
      setRitualUse(Array.isArray(data.ritualUse) ? data.ritualUse.join('\n') : '')
      setConsecrationStory(data.consecrationStory || '')
      setChakraValue(aiChakra)
    } catch {
      if (alive.current && !controller.signal.aborted) setError('Network error. Please try again.')
    } finally {
      requests.current.delete(controller); generateBusy.current = false
      if (alive.current) setGenerating(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="font-medium mb-3">Create Product</h2>
        <form aria-label="Create product" ref={formRef} action={nativeAction} onSubmit={event => { event.preventDefault(); void submitProduct(new FormData(event.currentTarget)) }} className="space-y-4">
          <input type="hidden" name="ownerId" value={ownerId} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <fieldset disabled={saving} className="space-y-4">
          {/* Row 1: Core fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" name="title" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-slug">Slug</Label>
              <Input id="new-slug" name="slug" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-price">Price (paise)</Label>
              <Input id="new-price" name="pricePaise" type="number" min="0" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-product-image">Product Image</Label>
              <input type="hidden" name="imageUrl" value={imageUrl} />
              {imageUrl && <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                <Image src={imageUrl} alt="Product" fill className="object-cover" />
                <button type="button" aria-label="Remove product image from draft" disabled={imagesBusy} onClick={() => setImageUrl('')} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 focus-ring"><X className="h-3.5 w-3.5" /></button>
              </div>}
              <button type="button" aria-label={imageUrl ? 'Replace product image' : 'Upload product image'} disabled={imagesBusy}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-colors focus-ring disabled:opacity-50 ${imageDragActive ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}`}
                onClick={() => imageInputRef.current?.click()}
                onDragOver={event => { event.preventDefault(); if (!imagesBusy) setImageDragActive(true) }}
                onDragLeave={() => setImageDragActive(false)}
                onDrop={event => { event.preventDefault(); setImageDragActive(false); const file = event.dataTransfer.files[0]; if (file) void handleImageUpload(file) }}>
                {imageUploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{imageUploading ? 'Uploading…' : imageUrl ? 'Replace image' : 'Drop image or click to upload'}</span>
              </button>
              <input ref={imageInputRef} id="new-product-image" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={imagesBusy}
                onChange={event => { const file = event.target.files?.[0]; if (file) void handleImageUpload(file); event.target.value = '' }} />
              <p className="text-xs text-muted-foreground">Public product photos only. JPEG, PNG or WebP, up to 4 MB each.</p>
              {failedImage && <div className="space-y-2">
                <p className="text-sm">Not uploaded: {failedImage.name}</p>
                <Button type="button" variant="outline" disabled={imagesBusy} onClick={() => void handleImageUpload(failedImage)}>Retry product image upload</Button>
                <Button type="button" variant="ghost" disabled={imagesBusy} onClick={() => { setFailedImage(null); setError('') }}>Remove failed image from draft</Button>
              </div>}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-stock-count">Stock quantity</Label>
              <Input id="new-stock-count" name="stockCount" type="number" min="0" max="2147483647" step="1" />
              <p className="text-xs text-muted-foreground">Blank means uncounted stock. Counted status follows quantity unless marked Out of Stock.</p>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-stock">Stock Status</Label>
              <select
                id="new-stock"
                name="stockStatus"
                className="h-9 rounded-md border px-2 bg-background"
                defaultValue="IN_STOCK"
              >
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW">Low Stock</option>
                <option value="OUT">Out of Stock</option>
              </select>
            </div>
          </div>

          {/* Gallery Upload Section */}
          <div className="space-y-2">
            <Label htmlFor="new-gallery-images">Product Gallery</Label>
            <input type="hidden" name="gallery" value={JSON.stringify(galleryUrls)} />
            <div className="flex flex-wrap gap-3">
              {galleryUrls.map((url, index) => <div key={url} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <Image src={url} alt={`Gallery ${index + 1}`} fill className="object-cover" />
                <button type="button" aria-label={`Remove gallery image ${index + 1} from draft`} disabled={imagesBusy}
                  onClick={() => setGalleryUrls(previous => previous.filter((_, i) => i !== index))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 focus-ring"><X className="h-3 w-3" /></button>
              </div>)}
              <button type="button" aria-label="Add gallery images" disabled={imagesBusy || failedGallery.length > 0 || galleryUrls.length >= PRODUCT_GALLERY_LIMIT}
                className="flex flex-col items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors focus-ring disabled:opacity-50"
                onClick={() => galleryInputRef.current?.click()}>
                {galleryUploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                <span className="text-[10px] text-muted-foreground mt-1">{galleryUploading ? 'Uploading…' : 'Add'}</span>
              </button>
            </div>
            <input ref={galleryInputRef} id="new-gallery-images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={imagesBusy || failedGallery.length > 0 || galleryUrls.length >= PRODUCT_GALLERY_LIMIT}
              onChange={event => { if (event.target.files?.length) void handleGalleryUpload(Array.from(event.target.files)); event.target.value = '' }} />
            <p className="text-xs text-muted-foreground">{galleryUrls.length} of {PRODUCT_GALLERY_LIMIT} gallery images uploaded.</p>
            {failedGallery.length > 0 && <div className="space-y-2">
              <p className="text-sm">Not uploaded: {failedGallery.map(file => file.name).join(', ')}</p>
              <Button type="button" variant="outline" disabled={imagesBusy} onClick={() => void handleGalleryUpload(failedGallery)}>Retry failed gallery uploads</Button>
              <Button type="button" variant="ghost" disabled={imagesBusy} onClick={() => { setFailedGallery([]); setError('') }}>Remove failed images from draft</Button>
            </div>}
          </div>

          {/* AI Generation Section */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800 p-4 space-y-3">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium">
              <Sparkles className="h-4 w-4" />
              AI Spiritual Content Generator
            </div>
            <p className="text-sm text-muted-foreground">
              Fill in the inputs below and click &quot;Generate&quot; to auto-fill spiritual descriptions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="ai-category">Category</Label>
                <Input
                  id="ai-category"
                  placeholder="e.g. Crystals"
                  value={aiCategory}
                  onChange={(e) => setAiCategory(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ai-chakra">Chakra</Label>
                <select
                  id="ai-chakra"
                  className="h-9 rounded-md border px-2 bg-background"
                  value={aiChakra}
                  onChange={(e) => setAiChakra(e.target.value)}
                >
                  <option value="">Select chakra...</option>
                  {CHAKRAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ai-material">Material</Label>
                <Input
                  id="ai-material"
                  placeholder="e.g. Natural Amethyst"
                  value={aiMaterial}
                  onChange={(e) => setAiMaterial(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ai-purpose">Spiritual Purpose</Label>
                <Input
                  id="ai-purpose"
                  placeholder="e.g. Meditation and intuition"
                  value={aiPurpose}
                  onChange={(e) => setAiPurpose(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={generating || saving}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Spiritual Content
                </>
              )}
            </Button>
          </div>

          {/* Generated / Editable Spiritual Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="new-short">Short Description</Label>
              <Input
                id="new-short"
                name="shortDescription"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-chakra">Chakra</Label>
              <select
                id="new-chakra"
                name="chakra"
                className="h-9 rounded-md border px-2 bg-background"
                value={chakraValue}
                onChange={(e) => setChakraValue(e.target.value)}
              >
                <option value="">None</option>
                {CHAKRAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-long">Long Description</Label>
            <textarea
              id="new-long"
              name="longDescription"
              className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="new-benefits">Spiritual Benefits (one per line)</Label>
              <textarea
                id="new-benefits"
                name="spiritualBenefits"
                className="min-h-[80px] rounded-md border px-3 py-2 bg-background text-sm"
                placeholder="enhances intuition&#10;calms mental activity&#10;deepens meditation"
                value={spiritualBenefits}
                onChange={(e) => setSpiritualBenefits(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-ritual">Ritual Use (one per line)</Label>
              <textarea
                id="new-ritual"
                name="ritualUse"
                className="min-h-[80px] rounded-md border px-3 py-2 bg-background text-sm"
                placeholder="hold during meditation&#10;place near pillow&#10;use during chakra alignment"
                value={ritualUse}
                onChange={(e) => setRitualUse(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-consecration">Consecration Story</Label>
            <textarea
              id="new-consecration"
              name="consecrationStory"
              className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm"
              value={consecrationStory}
              onChange={(e) => setConsecrationStory(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isConsecrated" value="true" className="rounded" />
              Mark as Consecrated
            </label>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={saving || imagesBusy || generating || !!failedImage || failedGallery.length > 0}>
              {saving ? 'Creating…' : 'Create Product'}
            </Button>
          </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  )
}
