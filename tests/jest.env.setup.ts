// Load test env from .env.test at the very beginning of Jest runtime
import { config as dotenv } from 'dotenv'
import path from 'node:path'

dotenv({ path: path.join(process.cwd(), '.env.test') })

// Default timezone for deterministic date logic
process.env.TZ = process.env.TZ || 'Asia/Kolkata'
