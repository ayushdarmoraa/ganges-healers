/**
 * Prisma configuration (migrated from package.json#prisma)
 *
 * Note:
 * - Keep paths identical to previous config.
 * - Do not introduce new options.
 * - Prisma CLI should pick this up automatically in newer versions.
 */

const config = {
  // Default schema path; kept explicit for clarity
  schema: './prisma/schema.prisma',

  // Seed command previously set in package.json#prisma.seed
  seed: 'tsx prisma/seed.ts',
}

export default config
