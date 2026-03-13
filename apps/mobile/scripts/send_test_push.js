#!/usr/bin/env node
/**
 * Send a test push notification via FCM to verify:
 * 1. Push is received by the app
 * 2. Push history is stored
 * 3. Badge count is updated
 * 4. Tapping notification opens detail page
 *
 * Usage:
 *   node send_test_push.js --token <FCM_DEVICE_TOKEN>
 *   node send_test_push.js --topic news
 *   node send_test_push.js --topic push_general
 */
require('dotenv').config();
const fs = require('fs');
const admin = require('firebase-admin');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !fs.existsSync(credPath)) {
  console.error('Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS in .env');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const token = getArg('--token');
const topic = getArg('--topic') || (token ? null : 'news');

if (!token && !topic) {
  console.error('Provide --token <FCM_TOKEN> or --topic <TOPIC>');
  process.exit(1);
}

const now = new Date();

const message = {
  notification: {
    title: '🧪 Test Push Notification',
    body: `This is a test push at ${now.toLocaleTimeString()}. If you see this in Push History, the fix is working!`,
  },
  data: {
    event: 'test_push',
    category: 'general',
    title: '🧪 Test Push Notification',
    body: `This is a test push at ${now.toLocaleTimeString()}. If you see this in Push History, the fix is working!`,
    updateTime: now.toISOString(),
    orderId: '',
    status: 'test',
    symbol: '',
  },
  ...(token ? { token } : { topic }),
};

// For iOS: add APNs headers to ensure delivery
if (token || topic) {
  message.apns = {
    headers: {
      'apns-priority': '10',
    },
    payload: {
      aps: {
        alert: {
          title: '🧪 Test Push Notification',
          body: `Test push at ${now.toLocaleTimeString()} — check Push History & badge!`,
        },
        sound: 'default',
        'mutable-content': 1,
        'content-available': 1,
      },
    },
  };
}

async function main() {
  console.log(
    `Sending test push to ${token ? 'token: ' + token.slice(0, 20) + '...' : 'topic: ' + topic}`,
  );
  console.log('Message:', JSON.stringify(message, null, 2));

  try {
    const result = await admin.messaging().send(message);
    console.log('✅ Push sent successfully! Message ID:', result);
    console.log('\n📋 Verification checklist:');
    console.log(
      '  1. Check Debug Console for [Push] onMessage / background handler logs',
    );
    console.log('  2. Open Push History screen — message should appear');
    console.log('  3. Check app badge count — should increment');
    console.log('  4. Tap the notification banner — should open detail page');
  } catch (err) {
    console.error('❌ Failed to send push:', err.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
