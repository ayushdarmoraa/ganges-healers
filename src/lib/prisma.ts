import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
const isTest = process.env.NODE_ENV === 'test'

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isTest ? [] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma