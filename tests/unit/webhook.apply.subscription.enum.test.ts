describe('applyWebhookSideEffects uses Prisma enum for ACTIVE', () => {
  it('updates with VIPMembershipStatus.ACTIVE', async () => {
    jest.resetModules()

    // Arrange: mock prisma update and capture the payload
    const update = jest.fn().mockResolvedValue({ id: 'mem_1' })
    jest.mock('@/lib/prisma', () => ({
      __esModule: true,
      default: { vIPMembership: { update } },
    }))

    // Important: import AFTER mocking prisma so TS types still compile,
    // but the runtime call goes to our mock.
    const { MembershipStatus } = await import('@prisma/client')
    const { applyWebhookSideEffects } = await import('@/lib/payments/webhook-apply')

    const event = {
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_abc' } } },
    }

    // Act
    const res = await applyWebhookSideEffects(event)

    // Assert
    expect(res).toEqual({ applied: true, action: 'subscription.activate' })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: 'sub_abc' },
        data: { status: MembershipStatus.active },
      })
    )
  })
})
