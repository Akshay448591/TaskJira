import 'dotenv/config';
import path from 'path';

const clean = (val) =>
  typeof val === 'string'
    ? val
        .replace(/[\r\n]/g, '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
    : val;

export const env = {
  port: Number(clean(process.env.PORT)) || 5000,
  mongoUri: clean(process.env.MONGO_URI) || 'mongodb://127.0.0.1:27017/taskjira',
  clientUrl: clean(process.env.CLIENT_URL) || 'http://localhost:5173',
  isProd: clean(process.env.NODE_ENV) === 'production',
  accessSecret: clean(process.env.JWT_ACCESS_SECRET),
  refreshSecret: clean(process.env.JWT_REFRESH_SECRET),
  uploadDir: path.resolve(clean(process.env.UPLOAD_DIR) || 'uploads'),
  mailFrom: clean(process.env.MAIL_FROM) || 'TaskJira <no-reply@taskjira.local>',
  smtp: {
    host: clean(process.env.SMTP_HOST),
    port: Number(clean(process.env.SMTP_PORT)) || 587,
    user: clean(process.env.SMTP_USER),
    pass: clean(process.env.SMTP_PASS),
  },
};

if (!env.accessSecret || !env.refreshSecret) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in server/.env');
}

