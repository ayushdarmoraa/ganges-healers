import { signOutCurrentSession } from '@/lib/auth/client-session'
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
const signOut = jest.requireMock<{ signOut: jest.Mock }>('next-auth/react').signOut
beforeEach(() => { jest.clearAllMocks(); signOut.mockResolvedValue({ url: 'http://another-configured-host.example/' }) })
afterEach(() => jest.restoreAllMocks())
test.each([null, {}])('confirms an empty session without using a configured-host redirect (%j)', async session => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(session)))
  await expect(signOutCurrentSession('/auth/signin')).resolves.toBeUndefined()
  expect(signOut).toHaveBeenCalledWith({ redirect: false, redirectTo: '/auth/signin' })
  expect(fetch).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' })
})
test.each([{ user: { id: 'still-active' } }, [], false, 'not-a-session'])('refuses an unconfirmed signed-out state (%j)', async session => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(session)))
  await expect(signOutCurrentSession('/')).rejects.toThrow('session is still active')
})
test('refuses a failed session check even when the sign-out request returned a URL', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('null', { status: 503 }))
  await expect(signOutCurrentSession('/')).rejects.toThrow('Session could not be checked')
})
test('requires an explicit authentication response before checking state', async () => {
  signOut.mockResolvedValue(undefined)
  const fetch = jest.spyOn(globalThis, 'fetch')
  await expect(signOutCurrentSession('/')).rejects.toThrow('Sign-out was not confirmed')
  expect(fetch).not.toHaveBeenCalled()
})
