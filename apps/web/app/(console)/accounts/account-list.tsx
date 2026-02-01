'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccountForm, type AccountFormInitialData } from './account-form';
import { deleteAccount } from '@/app/actions/accounts';
import { toast } from 'sonner';
import { Plus, Trash2, Edit } from 'lucide-react';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';
import { formatDate } from '@/lib/utils';
import type { AccountListItem } from '@/lib/types/account';

export function AccountList({ initialAccounts }: { initialAccounts: AccountListItem[] }) {
  const t = useTranslations('accounts.list');
  const locale = useLocale();
  const [accounts, setAccounts] = useState<AccountListItem[]>(initialAccounts);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountListItem | undefined>(
    undefined,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<AccountListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEdit = (account: AccountListItem) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingAccount(undefined);
    setIsFormOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAccount) return;
    setIsDeleting(true);
    try {
      await deleteAccount(deletingAccount.id);
      setAccounts(accounts.filter((a) => a.id !== deletingAccount.id));
      toast.success(t('messages.deleted'));
    } catch {
      toast.error(t('errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setDeletingAccount(null);
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
                    {formatDate(account.updatedTime, locale)}
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
                      onClick={() => {
                        setDeletingAccount(account);
                        setIsDeleteDialogOpen(true);
                      }}
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

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          {deletingAccount ? (
            <div className="text-sm text-muted-foreground">
              <div>
                {getExchangeDisplayName(deletingAccount.exchange as SupportedExchange)} •{' '}
                {deletingAccount.accountId}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingAccount(null);
              }}
              disabled={isDeleting}
            >
              {t('deleteDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={refresh}
        initialData={
          editingAccount
            ? ({
                id: editingAccount.id,
                exchange: editingAccount.exchange,
                accountId: editingAccount.accountId,
                apiKey: editingAccount.apiKey,
                isActive: editingAccount.isActive,
              } satisfies AccountFormInitialData)
            : undefined
        }
      />
    </div>
  );
}
