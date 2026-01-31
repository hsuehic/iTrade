'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountForm } from './account-form';
import { deleteAccount } from '@/app/actions/accounts';
import { toast } from 'sonner';
import { Plus, Trash2, Edit } from 'lucide-react';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';

interface Account {
  id: number;
  exchange: string;
  accountId: string;
  isActive: boolean;
  updatedTime: Date;
  apiKey: string;
}

export function AccountList({ initialAccounts }: { initialAccounts: Account[] }) {
  const t = useTranslations('accounts.list');
  const locale = useLocale();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(undefined);

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingAccount(undefined);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await deleteAccount(id);
      setAccounts(accounts.filter((a) => a.id !== id));
      toast.success(t('messages.deleted'));
    } catch (error) {
      toast.error(t('errors.deleteFailed'));
    }
  };

  const refresh = () => {
    // In a real app, re-fetch data or invalidate cache.
    // For simplicity, reload page or rely on router refresh.
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> {t('add')}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.exchange')}</TableHead>
              <TableHead>{t('table.accountName')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.apiKey')}</TableHead>
              <TableHead>{t('table.updated')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    {getExchangeDisplayName(account.exchange as SupportedExchange)}
                  </TableCell>
                  <TableCell>{account.accountId}</TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${account.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                    >
                      {account.isActive ? t('status.active') : t('status.inactive')}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{account.apiKey}</TableCell>
                  <TableCell>
                    {new Date(account.updatedTime).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(account)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(account.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AccountForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={refresh}
        initialData={editingAccount}
      />
    </div>
  );
}
