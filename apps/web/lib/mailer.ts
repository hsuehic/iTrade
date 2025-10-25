import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

export async function sendEmail(to: string, subject: string, text: string) {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[MAILER] SMTP not configured, email not sent to:', to);
    console.log('[MAILER] Email subject:', subject);
    console.log('[MAILER] Email content:', text);
    // In development, just log and continue
    if (process.env.NODE_ENV === 'development') {
      return;
    }
    throw new Error('SMTP not configured');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    connectionTimeout: 10000, // 10 seconds connection timeout
    greetingTimeout: 10000, // 10 seconds greeting timeout
    socketTimeout: 10000, // 10 seconds socket timeout
    auth: {
      user: process.env.SMTP_USER, // e.g. yourname@gmail.com
      pass: process.env.SMTP_PASS, // App Password
    },
  } as SMTPTransport.Options);

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'support@ihsueh.com',
      to,
      subject,
      html: text, // Changed from 'text' to 'html' to support HTML content
    });
    console.log('[MAILER] Email sent successfully to:', to);
  } catch (error) {
    console.error('[MAILER] Failed to send email:', error);
    throw error;
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail(
    to,
    'Reset your password',
    `
      <h2>Password Reset</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 10 minutes.</p>
    `,
  );
}

export async function sendDeleteAccountVerificationEmail(to: string, code: string) {
  await sendEmail(
    to,
    'Delete Account Verification Code',
    `
      <h2>Account Deletion Verification</h2>
      <p>You have requested to delete your iTrade account.</p>
      <p>Your verification code is:</p>
      <h1 style="color: #dc2626; font-size: 32px; letter-spacing: 4px; font-weight: bold;">${code}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email and your account will remain active.</p>
      <p style="margin-top: 20px; color: #666;">
        <strong>Warning:</strong> This action cannot be undone. All your data including strategies, trades, and portfolios will be permanently deleted.
      </p>
    `,
  );
}
