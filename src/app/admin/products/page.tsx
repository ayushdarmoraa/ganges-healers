import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreateProductForm } from '@/components/admin/create-product-form'
import { CatalogEditor } from '@/components/admin/catalog-editor'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { deleteProductSchema, deleteUnreferencedProduct, productDeleteVersion, ProductAdminError, createCatalogProduct, updateCatalogProduct, toggleCatalogProduct } from '@/lib/store/admin'
import { DeleteProductForm, type ProductDeleteResult } from '@/components/admin/delete-product-form'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  const current = await prisma.user.findUnique({ where: { id: session.user.id, closedAt: null }, select: { role: true } })
  if (current?.role !== 'ADMIN') redirect('/')
  return session
}

function productWriteError(error: unknown) {
  if (error instanceof ProductAdminError) return { error: error.message, reloadRequired: error.code === 'PRODUCT_CHANGED' }
  if ((error as { status?: number })?.status === 403) return { error: 'Administrator access is required.' }
  console.error('[admin][products][save_error]', { type: error instanceof Error ? error.name : 'unknown' })
  return { error: 'The product could not be saved. Please try again.' }
}

async function productActor(form: FormData) {
  const actor = await requireCurrentAdmin()
  if (form.get('ownerId') !== actor.id) throw new ProductAdminError('Your account changed. Reload this page before saving.', 409, 'SESSION_CHANGED')
  return actor
}

function refreshProduct(slug: string) {
  revalidatePath('/admin/products'); revalidatePath('/store'); revalidatePath(`/store/${slug}`)
}

async function createProduct(formData: FormData) {
  'use server'
  try {
    const actor = await productActor(formData)
    const product = await createCatalogProduct(actor.id, formData)
    refreshProduct(product.slug)
    return {}
  } catch (error) { return productWriteError(error) }
}

async function updateProduct(formData: FormData) {
  'use server'
  try {
    const actor = await productActor(formData)
    const product = await updateCatalogProduct(actor.id, formData)
    refreshProduct(product.slug)
    return {}
  } catch (error) { return productWriteError(error) }
}

async function toggleProduct(formData: FormData) {
  'use server'
  try {
    const actor = await productActor(formData)
    const product = await toggleCatalogProduct(actor.id, formData)
    refreshProduct(product.slug)
    return {}
  } catch (error) { return productWriteError(error) }
}

async function deleteProduct(formData: FormData): Promise<ProductDeleteResult> {
  'use server'
  try {
    const actor = await requireCurrentAdmin()
    const parsed = deleteProductSchema.safeParse({ id: formData.get('id'), version: formData.get('version') })
    if (!parsed.success) return { success: false, error: 'Reload the product list before deleting.', code: 'INVALID_PRODUCT_VERSION' }
    const deleted = await deleteUnreferencedProduct(actor.id, parsed.data)
    revalidatePath('/admin/products'); revalidatePath('/store'); revalidatePath(`/store/${deleted.slug}`)
    return { success: true }
  } catch (error) {
    if (error instanceof ProductAdminError) return { success: false, error: error.message, code: error.code }
    if ((error as { status?: number })?.status === 403) return { success: false, error: 'Administrator access is required.', code: 'FORBIDDEN' }
    console.error('[admin][products][delete_error]', { type: error instanceof Error ? error.name : 'unknown' })
    return { success: false, error: 'The product could not be deleted. Please try again.' }
  }
}

export default async function AdminProductsPage() {
  const session = await guardAdmin()

  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { title: true } },
      _count: { select: { orderItems: true, bundleItems: true } },
    },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Products</h1>

      <CreateProductForm formAction={createProduct} />

      <Card>
        <CardContent className="p-0 divide-y">
          {products.map((p) => (
            <article key={p.id} aria-label={`Product ${p.title}`} className="p-4 space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">
                    {p.title}
                    {!p.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                  </h2>
                  <div className="text-sm text-muted-foreground">
                    /{p.slug} · ₹{(p.pricePaise / 100).toFixed(2)} · {p.stockStatus} · {p.stockCount === null ? 'Uncounted stock' : `${p.stockCount} units`} · {p.category?.title || 'No category'} · {p._count.orderItems} orders
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <CatalogEditor key={`toggle-${productDeleteVersion(p)}`} action={toggleProduct} item="Product" compact submitLabel={p.isActive ? 'Deactivate' : 'Activate'}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="version" value={productDeleteVersion(p)} />
                    <input type="hidden" name="ownerId" value={session.user.id} />
                  </CatalogEditor>
                  <DeleteProductForm id={p.id} title={p.title} version={productDeleteVersion(p)} ownerId={session.user.id} protectedHistory={p._count.orderItems > 0 || p._count.bundleItems > 0} action={deleteProduct} />
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                <CatalogEditor key={productDeleteVersion(p)} action={updateProduct} item="Product">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="version" value={productDeleteVersion(p)} />
                  <input type="hidden" name="ownerId" value={session.user.id} />
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-title`}>Title</Label>
                    <Input id={`product-${p.id}-title`} name="title" defaultValue={p.title} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-pricePaise`}>Price (paise)</Label>
                    <Input id={`product-${p.id}-pricePaise`} name="pricePaise" type="number" min="0" max="2147483647" step="1" defaultValue={p.pricePaise} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-stockCount`}>Stock quantity</Label>
                    <Input id={`product-${p.id}-stockCount`} name="stockCount" type="number" min="0" max="2147483647" step="1" defaultValue={p.stockCount ?? ''} />
                    <p className="text-xs text-muted-foreground">Blank means uncounted stock. Counted status follows quantity unless marked Out of Stock; choose In Stock when replenishing.</p>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-stockStatus`}>Stock Status</Label>
                    <select id={`product-${p.id}-stockStatus`} name="stockStatus" className="h-9 rounded-md border px-2 bg-background" defaultValue={p.stockStatus}>
                      <option value="IN_STOCK">In Stock</option>
                      <option value="LOW">Low Stock</option>
                      <option value="OUT">Out of Stock</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-imageUrl`}>Image URL</Label>
                    <Input id={`product-${p.id}-imageUrl`} name="imageUrl" defaultValue={p.imageUrl ?? ''} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`product-${p.id}-shortDescription`}>Short Description</Label>
                    <Input id={`product-${p.id}-shortDescription`} name="shortDescription" defaultValue={p.shortDescription} />
                  </div>
                  <div className="md:col-span-3 grid gap-1">
                    <Label htmlFor={`product-${p.id}-longDescription`}>Long Description</Label>
                    <textarea id={`product-${p.id}-longDescription`} name="longDescription" defaultValue={p.longDescription} className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                  </div>
                </CatalogEditor>
              </details>
            </article>
          ))}
          {products.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No products yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
