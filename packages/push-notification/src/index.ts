import admin from 'firebase-admin';
import type { BatchResponse } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadServiceAccountFromPath(filePath: string): admin.ServiceAccount | null {
  const candidates = [
    filePath,
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), '..', filePath),
    path.resolve(process.cwd(), '../..', filePath),
  ];

  const found = candidates.find((p) => existsSync(p));
  if (!found) return null;

  const raw = readFileSync(found, 'utf-8');
  return JSON.parse(raw) as admin.ServiceAccount;
}

// Initialize Firebase Admin only if service account is available
if (!admin.apps.length) {
  // Prefer env JSON; otherwise read from a repo-relative file path.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
    } catch (error) {
      console.warn('Failed to initialize Firebase Admin:', error);
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    try {
      const serviceAccount = loadServiceAccountFromPath(
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
      );
      if (!serviceAccount) {
        console.warn(
          `Firebase Admin not initialized: FIREBASE_SERVICE_ACCOUNT_PATH not found: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`,
        );
      } else {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
    } catch (error) {
      console.warn('Failed to initialize Firebase Admin from file:', error);
    }
  } else {
    console.warn(
      'Firebase Admin not initialized: FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_PATH not set',
    );
  }
}

const msg = admin.apps.length > 0 ? admin.messaging() : null;

export type Message = admin.messaging.Message;
export type { BatchResponse };

export const isPushEnabled = () => Boolean(msg);

// 通用发送函数
export const sendMessage = async (payload: Message) => {
  if (!msg) {
    throw new Error('Firebase messaging not initialized');
  }
  const result = await msg.send(payload);
  return result;
};

export const sendToDevice = async (
  deviceToken: string,
  notification: Message['notification'],
  data?: Record<string, string>,
  apnsConfig?: {
    aps?: {
      badge?: number;
      sound?: string;
      alert?: string | admin.messaging.ApsAlert;
      contentAvailable?: boolean;
      mutableContent?: boolean;
      category?: string;
      threadId?: string;
    };
  },
) => {
  // Merge default APNS config with custom config
  const defaultAps: admin.messaging.Aps = { sound: 'default' };
  const customAps = apnsConfig?.aps ?? {};

  // Build merged APS config, ensuring badge is a number if provided
  const mergedAps: admin.messaging.Aps = {
    ...defaultAps,
    ...(customAps.badge !== undefined && { badge: Number(customAps.badge) }),
    ...(customAps.sound !== undefined && { sound: customAps.sound }),
    ...(customAps.alert !== undefined && { alert: customAps.alert }),
    ...(customAps.contentAvailable !== undefined && {
      contentAvailable: customAps.contentAvailable,
    }),
    ...(customAps.mutableContent !== undefined && {
      mutableContent: customAps.mutableContent,
    }),
    ...(customAps.category !== undefined && { category: customAps.category }),
    ...(customAps.threadId !== undefined && { threadId: customAps.threadId }),
  };

  // Log APNS payload for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Push Notification] APNS payload:', JSON.stringify(mergedAps, null, 2));
  }

  return sendMessage({
    token: deviceToken,
    notification,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: mergedAps } },
    data,
  });
};

export const sendToTopic = async (
  topic: string,
  notification: Message['notification'],
  data?: Record<string, string>,
  apnsConfig?: {
    aps?: {
      badge?: number;
      sound?: string;
      alert?: string | admin.messaging.ApsAlert;
      contentAvailable?: boolean;
      mutableContent?: boolean;
      category?: string;
      threadId?: string;
    };
  },
) => {
  // Merge default APNS config with custom config
  const defaultAps: admin.messaging.Aps = { sound: 'default' };
  const customAps = apnsConfig?.aps ?? {};

  // Build merged APS config, ensuring badge is a number if provided
  const mergedAps: admin.messaging.Aps = {
    ...defaultAps,
    ...(customAps.badge !== undefined && { badge: Number(customAps.badge) }),
    ...(customAps.sound !== undefined && { sound: customAps.sound }),
    ...(customAps.alert !== undefined && { alert: customAps.alert }),
    ...(customAps.contentAvailable !== undefined && {
      contentAvailable: customAps.contentAvailable,
    }),
    ...(customAps.mutableContent !== undefined && {
      mutableContent: customAps.mutableContent,
    }),
    ...(customAps.category !== undefined && { category: customAps.category }),
    ...(customAps.threadId !== undefined && { threadId: customAps.threadId }),
  };

  return sendMessage({
    topic,
    notification,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: mergedAps } },
    data,
  });
};

export const sendToMultipleDevices = async (
  tokens: string[],
  notification: Message['notification'],
  data?: Record<string, string>,
  apnsConfig?: {
    aps?: {
      badge?: number;
      sound?: string;
      alert?: string | admin.messaging.ApsAlert;
      contentAvailable?: boolean;
      mutableContent?: boolean;
      category?: string;
      threadId?: string;
    };
  },
): Promise<BatchResponse> => {
  if (!msg) {
    throw new Error('Firebase messaging not initialized');
  }
  if (tokens.length > 500) throw new Error('Maximum 500 tokens per request');

  // Merge default APNS config with custom config
  const defaultAps: admin.messaging.Aps = { sound: 'default' };
  const customAps = apnsConfig?.aps ?? {};

  // Build merged APS config, ensuring badge is a number if provided
  const mergedAps: admin.messaging.Aps = {
    ...defaultAps,
    ...(customAps.badge !== undefined && { badge: Number(customAps.badge) }),
    ...(customAps.sound !== undefined && { sound: customAps.sound }),
    ...(customAps.alert !== undefined && { alert: customAps.alert }),
    ...(customAps.contentAvailable !== undefined && {
      contentAvailable: customAps.contentAvailable,
    }),
    ...(customAps.mutableContent !== undefined && {
      mutableContent: customAps.mutableContent,
    }),
    ...(customAps.category !== undefined && { category: customAps.category }),
    ...(customAps.threadId !== undefined && { threadId: customAps.threadId }),
  };

  const result = await msg.sendEachForMulticast({
    tokens,
    notification,
    android: { notification: { sound: 'default' } },
    apns: { payload: { aps: mergedAps } },
    data,
  });
  return result;
};
