import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export async function sendMail({ to, subject, text }) {
  try {
    if (!transport) {
      console.log(`\n=== MAIL (SMTP not configured) ===\nTo: ${to}\nSubject: ${subject}\n\n${text}\n==================================\n`);
      return;
    }
    await transport.sendMail({ from: env.mailFrom, to, subject, text });
  } catch (err) {
    console.error('Mail error:', err.message);
  }
}
