import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || 'apps/api/data/app.sqlite'),
  storageDir: path.resolve(ROOT, process.env.STORAGE_DIR || 'apps/api/storage'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173',
  webDist: path.join(ROOT, 'apps', 'web', 'dist'),
  trustProxy: process.env.TRUST_PROXY === '1',
  collegeId: (process.env.COLLEGE_ID || 'COLLEGE-001').slice(0, 31),
  /** Demo/testing: treat every step's SLA as this many minutes instead of its hours. */
  slaMinutes: process.env.SLA_MINUTES ? Number(process.env.SLA_MINUTES) : null,
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'log') as 'log' | 'ses' | 'off',
    from: process.env.EMAIL_FROM || 'PaperLess Campus <no-reply@campus.example>',
    sesRegion: process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1',
    redirectAll: process.env.EMAIL_REDIRECT_ALL || '',
  },
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),
  chainMode: (process.env.CHAIN_MODE || 'local') as 'local' | 'amoy' | 'off',
  localRpcUrl: process.env.CHAIN_RPC_URL || 'http://127.0.0.1:8545',
  amoyRpcUrl: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
  amoyPrivateKey: process.env.AMOY_PRIVATE_KEY || '',
};
