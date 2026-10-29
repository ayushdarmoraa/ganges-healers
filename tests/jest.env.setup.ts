// Load test env from .env.test at the very beginning of Jest runtime
import { loadTestDatabaseEnvironment } from '../scripts/test-database'

Object.assign(process.env, loadTestDatabaseEnvironment().environment)

// Default timezone for deterministic date logic
process.env.TZ = process.env.TZ || 'Asia/Kolkata'
