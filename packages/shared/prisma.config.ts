import path from 'node:path';
import { defineConfig, env } from 'prisma/config';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'src/db/prisma/',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
