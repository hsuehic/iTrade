import admin from 'firebase-admin';

// TODO: get you service account file first
import serviceAccount from './itrade-965d8-firebase-admin.json' assert { type: 'json' };

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

const msg = admin.messaging();

type Message = Parameters<typeof msg.send>[0];

// 通用发送函数
export const sendMessage = async (payload: Message) => {
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
