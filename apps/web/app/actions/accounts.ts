'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
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
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user;
}

export async function getAccounts() {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  
  return accountService.getUserAccounts(user.id);
}

export async function saveAccount(data: AccountDto) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  if (!isValidExchange(data.exchange)) {
    throw new Error('Invalid exchange');
  }

  await accountService.upsertAccount({
      ...data,
      userId: user.id
  });

  return { success: true };
}

export async function deleteAccount(id: number) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  const success = await accountService.removeAccount(id, user.id);
  return { success };
}
