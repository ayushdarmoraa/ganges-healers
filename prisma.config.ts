import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // Keep the seed command identical to the previous package.json#prisma.seed
    seed: "tsx prisma/seed.ts",
  },
});
