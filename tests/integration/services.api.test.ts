/**
 * Integration tests for Services API
 * Covers: GET /api/services (list with filters), GET /api/services/[id], POST (admin), PUT (admin), DELETE (admin)
 */

jest.setTimeout(20000)

jest.mock('@/lib/auth', () => {
  return {
    auth: async () => ({
      user: {
        id: process.env.TEST_USER_ID,
        role: process.env.TEST_USER_ROLE || 'USER',
        email: 'test@example.com',
      }
    }),
  }
})

import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as ServicesCollection from '@/app/api/services/route'
import * as ServicesById from '@/app/api/services/[id]/route'

type ServicesCollectionModule = {
  GET?: (req: Request) => Promise<Response>
  POST?: (req: Request) => Promise<Response>
}

type ServicesByIdModule = {
  GET?: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  PUT?: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  DELETE?: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
}

const CollectionHandlers = ServicesCollection as unknown as ServicesCollectionModule
const IdHandlers = ServicesById as unknown as ServicesByIdModule

describe('API /api/services integration', () => {
  let testService: { id: string; name: string; category: string; tagline?: string }
  let adminUserId: string

  beforeAll(async () => {
    // Create admin user for testing
    const adminUser = await prisma.user.create({
      data: { 
        email: `admin_${Date.now()}@test.com`, 
        password: 'hashed', 
        role: 'ADMIN',
        name: 'Test Admin'
      }
    })
    adminUserId = adminUser.id

    // Get existing service from seed data
    testService = await prisma.service.findFirst({ where: { isActive: true } })
    if (!testService) {
      throw new Error('No active services found in seed data')
    }
  })

  afterAll(async () => {
    // Cleanup admin user
    if (adminUserId) {
      await prisma.user.delete({ where: { id: adminUserId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  describe('GET /api/services', () => {
    test('returns paginated services list', async () => {
      const req = makeNextRequest('http://localhost/api/services?page=1&limit=5')
      const res = await CollectionHandlers.GET!(req)
      
      expect(res.status).toBe(200)
      const body = await readJSON(res)
      
      expect(body.success).toBe(true)
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.pagination).toBeDefined()
      expect(body.pagination.page).toBe(1)
      expect(body.pagination.limit).toBe(5)
    })

    test('filters services by category', async () => {
      const req = makeNextRequest(`http://localhost/api/services?category=${testService.category}`)
      const res = await CollectionHandlers.GET!(req)
      
      expect(res.status).toBe(200)
      const body = await readJSON(res)
      
      expect(body.success).toBe(true)
      expect(body.data.every((service: { category: string }) => service.category === testService.category)).toBe(true)
    })

    test('filters services by price range', async () => {
      const req = makeNextRequest('http://localhost/api/services?minPrice=5000&maxPrice=8000')
      const res = await CollectionHandlers.GET!(req)
      
      expect(res.status).toBe(200)
      const body = await readJSON(res)
      
      expect(body.success).toBe(true)
      expect(body.data.every((service: { price: number }) => service.price >= 5000 && service.price <= 8000)).toBe(true)
    })

    test('searches services by text', async () => {
      const req = makeNextRequest('http://localhost/api/services?search=healing')
      const res = await CollectionHandlers.GET!(req)
      
      expect(res.status).toBe(200)
      const body = await readJSON(res)
      
      expect(body.success).toBe(true)
      // Should find services with "healing" in name, description, or tagline
    })
  })

  describe('GET /api/services/[id]', () => {
    test('returns service details by ID', async () => {
      const req = makeNextRequest(`http://localhost/api/services/${testService.id}`)
      const res = await IdHandlers.GET!(req, { params: Promise.resolve({ id: testService.id }) })
      
      expect(res.status).toBe(200)
      const body = await readJSON(res)
      
      expect(body.success).toBe(true)
      expect(body.data.id).toBe(testService.id)
      expect(body.data.name).toBe(testService.name)
      expect(body.data.healers).toBeDefined()
      expect(body.data.averageRating).toBeDefined()
      expect(body.data.totalBookings).toBeDefined()
    })

    test('returns 404 for non-existent service', async () => {
      const fakeId = 'cm_fake_service_id'
      const req = makeNextRequest(`http://localhost/api/services/${fakeId}`)
      const res = await IdHandlers.GET!(req, { params: Promise.resolve({ id: fakeId }) })
      
      expect(res.status).toBe(404)
      const body = await readJSON(res)
      expect(body.error).toMatch(/not found/i)
    })
  })

  describe('POST /api/services (Admin only)', () => {
    test('admin can create new service', async () => {
      // Set admin role for this test
      process.env.TEST_USER_ID = adminUserId
      process.env.TEST_USER_ROLE = 'ADMIN'

      const newService = {
        name: 'Test Service',
        description: 'Test service description',
        tagline: 'Test tagline',
        category: 'Test Category',
        price: 5000,
        duration: 60,
        mode: 'BOTH',
        benefits: ['Benefit 1', 'Benefit 2']
      }

      const req = makeNextRequest('http://localhost/api/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newService)
      })

      const res = await CollectionHandlers.POST!(req)
      expect(res.status).toBe(201)
      
      const body = await readJSON(res)
      expect(body.success).toBe(true)
      expect(body.data.name).toBe(newService.name)
      expect(body.data.slug).toBe('test-service')

      // Cleanup
      await prisma.service.delete({ where: { id: body.data.id } })
    })

    test('non-admin cannot create service', async () => {
      // Set regular user role
      process.env.TEST_USER_ROLE = 'USER'

      const req = makeNextRequest('http://localhost/api/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      })

      const res = await CollectionHandlers.POST!(req)
  // Current behavior returns 403 for non-admin authenticated user.
  expect(res.status).toBe(403)
      
      const body = await readJSON(res)
  expect(body.error).toMatch(/(unauthorized|forbidden)/i)
    })

    test('validates required fields', async () => {
      process.env.TEST_USER_ID = adminUserId
      process.env.TEST_USER_ROLE = 'ADMIN'

      const req = makeNextRequest('http://localhost/api/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Incomplete Service' }) // Missing required fields
      })

      const res = await CollectionHandlers.POST!(req)
      expect(res.status).toBe(400)
      
      const body = await readJSON(res)
      expect(body.error).toMatch(/missing required fields/i)
    })
  })

  describe('PUT /api/services/[id] (Admin only)', () => {
    test('admin can update service', async () => {
      process.env.TEST_USER_ID = adminUserId
      process.env.TEST_USER_ROLE = 'ADMIN'

      const updateData = { tagline: 'Updated tagline' }
      const req = makeNextRequest(`http://localhost/api/services/${testService.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      const res = await IdHandlers.PUT!(req, { params: Promise.resolve({ id: testService.id }) })
      expect(res.status).toBe(200)
      
      const body = await readJSON(res)
      expect(body.success).toBe(true)
      expect(body.data.tagline).toBe('Updated tagline')

      // Restore original tagline
      await prisma.service.update({
        where: { id: testService.id },
        data: { tagline: testService.tagline }
      })
    })

    test('non-admin cannot update service', async () => {
      process.env.TEST_USER_ROLE = 'USER'

      const req = makeNextRequest(`http://localhost/api/services/${testService.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tagline: 'Hacked!' })
      })

      const res = await IdHandlers.PUT!(req, { params: Promise.resolve({ id: testService.id }) })
  expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/services/[id] (Admin only)', () => {
    test('admin can soft delete service', async () => {
      // Create a test service to delete
      const serviceToDelete = await prisma.service.create({
        data: {
          name: 'Delete Test Service',
          slug: `delete-test-${Date.now()}`,
          description: 'Service to be deleted',
          category: 'Test',
          price: 1000,
          duration: 30
        }
      })

      process.env.TEST_USER_ID = adminUserId
      process.env.TEST_USER_ROLE = 'ADMIN'

      const req = makeNextRequest(`http://localhost/api/services/${serviceToDelete.id}`, {
        method: 'DELETE'
      })

      const res = await IdHandlers.DELETE!(req, { params: Promise.resolve({ id: serviceToDelete.id }) })
      expect(res.status).toBe(200)
      
      const body = await readJSON(res)
      expect(body.success).toBe(true)
      expect(body.message).toMatch(/deactivated/i)

      // Verify service is marked as inactive
      const deletedService = await prisma.service.findUnique({ where: { id: serviceToDelete.id } })
      expect(deletedService?.isActive).toBe(false)

      // Cleanup
      await prisma.service.delete({ where: { id: serviceToDelete.id } })
    })

    test('non-admin cannot delete service', async () => {
      process.env.TEST_USER_ROLE = 'USER'

      const req = makeNextRequest(`http://localhost/api/services/${testService.id}`, {
        method: 'DELETE'
      })

      const res = await IdHandlers.DELETE!(req, { params: Promise.resolve({ id: testService.id }) })
  expect(res.status).toBe(403)
    })
  })
})