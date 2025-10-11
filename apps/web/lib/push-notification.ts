import admin from 'firebase-admin';

// TODO: get you service account file first
// import serviceAccount from './itrade-965d8-firebase-admin.json' assert { type: 'json' };

// Initialize Firebase Admin only if service account is available
if (!admin.apps.length) {
  // Check if Firebase credentials are available in environment variables
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(
          serviceAccount as admin.ServiceAccount
        ),
      });
    } catch (error) {
      console.warn('Failed to initialize Firebase Admin:', error);
    }
  } else {
    console.warn(
      'Firebase Admin not initialized: FIREBASE_SERVICE_ACCOUNT environment variable not set'
    );
  }
}

const msg = admin.apps.length > 0 ? admin.messaging() : null;

type Message = admin.messaging.Message;

// 通用发送函数
export const sendMessage = async (payload: Message) => {
  if (!msg) {
    throw new Error('Firebase messaging not initialized');
  }
  try {
    const result = await msg.send(payload);
    return result;
  } catch (error) {
    throw error;
  }
};

export const sendToDevice = async (
  deviceToken: string,
  notification: Message['notification'],
  data?: Record<string, string>
) => {
  return sendMessage({
    token: deviceToken,
    notification,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
    data,
  });
};

export const sendToTopic = async (
  topic: string,
  notification: Message['notification'],
  data?: Record<string, string>
) => {
  return sendMessage({
    topic,
    notification,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
    data,
  });
};

export const sendToMultipleDevices = async (
  tokens: string[],
  notification: Message['notification'],
  data?: Record<string, string>
) => {
  if (!msg) {
    throw new Error('Firebase messaging not initialized');
  }
  if (tokens.length > 500) throw new Error('Maximum 500 tokens per request');
  try {
    const result = await msg.sendEachForMulticast({
      tokens,
      notification,
      android: { notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
      data,
    });
    return result;
  } catch (error) {
    throw error;
  }
};
