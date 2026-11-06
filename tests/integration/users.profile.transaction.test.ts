import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { profileVersion, updateOwnProfile } from '@/lib/users/profile'

let userId = '', otherId = ''
const phone = () => `9${randomUUID().replace(/\D/g, '').padEnd(9, '0').slice(0, 9)}`
const current = () => prisma.user.findUniqueOrThrow({ where: { id: userId } })
beforeEach(async () => {
  const suffix = randomUUID()
  userId = (await prisma.user.create({ data: { email: `profile-${suffix}@example.test`, name: 'Original', password: 'preserved-credential', securityVersion: 5, vip: true, freeSessionCredits: 3 } })).id
  otherId = (await prisma.user.create({ data: { email: `other-profile-${suffix}@example.test`, name: 'Other original' } })).id
})
afterEach(async () => { await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } }) })
afterAll(async () => { await prisma.$disconnect() })

test('a newer saved profile cannot be overwritten by an older tab', async () => {
  const original = await current()
  await prisma.user.update({ where: { id: userId }, data: { name: 'Newer saved name' } })
  await expect(updateOwnProfile(userId, { name: 'Stale draft' }, profileVersion(original))).rejects.toMatchObject({ status: 409, code: 'PROFILE_CHANGED' })
  expect((await current()).name).toBe('Newer saved name')
})
test('two different concurrent drafts cannot both replace the same saved version', async () => {
  const version = profileVersion(await current())
  const outcomes = await Promise.allSettled([updateOwnProfile(userId, { name: 'First draft' }, version), updateOwnProfile(userId, { name: 'Second draft' }, version)])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect((outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'PROFILE_CHANGED' })
  expect(['First draft', 'Second draft']).toContain((await current()).name)
})
test('an external writer committing while a conditional update waits is preserved', async () => {
  const version = profileVersion(await current())
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve })
  const unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { name: 'External saved name' } })
    acquired(); await unlock
  }, { timeout: 15000 })
  await locked
  const pending = updateOwnProfile(userId, { name: 'Stale draft' }, version).then(value => ({ value, error: null }), error => ({ value: null, error }))
  try {
    let waiting = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%UPDATE%User%'}) AS waiting`
      if (rows[0].waiting) { waiting = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(waiting).toBe(true)
  } finally { release(); await blocker; await pending }
  expect((await pending).error).toMatchObject({ status: 409, code: 'PROFILE_CHANGED' })
  expect((await current()).name).toBe('External saved name')
})
test('racing phone claims produce one success and one conflict without partial name changes', async () => {
  const number = phone(), first = await current(), second = await prisma.user.findUniqueOrThrow({ where: { id: otherId } })
  const outcomes = await Promise.allSettled([updateOwnProfile(userId, { name: 'First changed', phone: number }, profileVersion(first)), updateOwnProfile(otherId, { name: 'Other changed', phone: number }, profileVersion(second))])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect((outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409, message: 'Phone number already in use' })
  expect(await prisma.user.count({ where: { phone: number } })).toBe(1)
  const loser = outcomes[0].status === 'rejected' ? await current() : await prisma.user.findUniqueOrThrow({ where: { id: otherId } })
  expect(loser.phone).toBeNull()
  expect(loser.name).toBe(outcomes[0].status === 'rejected' ? first.name : second.name)
})
test('unrelated benefit changes do not invalidate a draft and credentials/entitlements are retained', async () => {
  const original = await current(), version = profileVersion(original)
  const before = await prisma.user.update({ where: { id: userId }, data: { freeSessionCredits: 9 } })
  const payment = await prisma.payment.create({ data: { userId, type: 'STORE', gateway: 'razorpay', amountPaise: 1200, status: 'success', statusEnum: 'SUCCESS' } })
  try {
    const saved = await updateOwnProfile(userId, { name: 'Updated' }, version)
    const after = await current()
    expect(after).toEqual({ ...before, name: 'Updated', updatedAt: after.updatedAt })
    expect(saved.profileVersion).toBe(profileVersion(after))
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toEqual(payment)
  } finally { await prisma.payment.delete({ where: { id: payment.id } }) }
})
test('a failed phone claim can be retried and clearing a saved phone releases only that account number', async () => {
  const number = phone(), version = profileVersion(await current())
  await prisma.user.update({ where: { id: otherId }, data: { phone: number } })
  await expect(updateOwnProfile(userId, { name: 'Updated', phone: number }, version)).rejects.toMatchObject({ status: 409 })
  expect(profileVersion(await current())).toBe(version)
  await prisma.user.update({ where: { id: otherId }, data: { phone: null } })
  const saved = await updateOwnProfile(userId, { name: 'Updated', phone: number }, version)
  await updateOwnProfile(userId, { phone: null }, saved.profileVersion)
  expect((await current()).phone).toBeNull()
  await prisma.user.update({ where: { id: otherId }, data: { phone: number } })
  expect((await prisma.user.findUniqueOrThrow({ where: { id: otherId } })).phone).toBe(number)
})
