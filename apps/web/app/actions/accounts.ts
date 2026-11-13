'use server';

import { headers } from 'next/headers';
import { getAuthFromHeaders } from '@/lib/auth';
import type { AccountListItem } from '@/lib/types/account';
import * as accountService from '@/lib/services/account-service';
import { isValidExchange } from '@itrade/data-manager';

export interface AccountDto {
  id?: number;
  exchange: string;
  accountId: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  isActive: boolean;
}

async function getUser() {
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  return session?.user;
}

export async function getAccounts(): Promise<AccountListItem[]> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  return accountService.getUserAccounts(user.id);
}

export async function saveAccount(data: AccountDto): Promise<
  | { success: true }
  | {
      success: false;
      error: {
        reason: string;
        venueCode: string;
        venueMessage: string;
      };
    }
> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  if (!isValidExchange(data.exchange)) {
    throw new Error('Invalid exchange');
  }

  try {
    await accountService.upsertAccount({
      ...data,
      userId: user.id,
    });
  } catch (error) {
    // Return (not throw) credential failures: thrown Errors crossing the
    // server-action serialization boundary lose custom fields (in prod the
    // message itself is redacted to a digest), so the form could never read
    // reason/venueCode/venueMessage. A result union survives intact.
    if (error instanceof accountService.CredentialVerificationError) {
      return {
        success: false,
        error: {
          reason: error.reason,
          venueCode: error.venueCode,
          venueMessage: error.venueMessage,
        },
      };
    }
    throw error;
  }

  return { success: true };
}

export async function deleteAccount(id: number) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  const success = await accountService.removeAccount(id, user.id);
  return { success };
}
