import { config } from 'dotenv';
import { sendEmail } from '@/lib/mailer';

config();
const main = async () => {
  await sendEmail('xiaoweihsueh@gmail.com', 'Reset password', 'This is a test email.');
};

main();
