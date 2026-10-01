'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft } from 'lucide-react';

import { ExchangeSelector } from '@/components/exchange-selector';
import { InternalTransfersTable } from '@/components/internal-transfers-table';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SidebarInset } from '@/components/ui/sidebar';
import { ExchangeId, SUPPORTED_EXCHANGES } from '@/lib/exchanges';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';

import {
  TRANSFER_CAPABLE_EXCHANGES,
  TransferForm,
  type TransferFormAccount,
} from '../../accounts/transfer-form';

const toExchangeId = (value: string): ExchangeId | null =>
  SUPPORTED_EXCHANGES.some((exchange) => exchange.id === value)
    ? (value as ExchangeId)
    : null;

export default function InternalTransfersPage() {
  return (
    <Suspense fallback={null}>
      <InternalTransfersPageContent />
    </Suspense>
  );
}

// useSearchParams() requires a Suspense boundary above it for static
// prerendering — see the wrapper export above.
function InternalTransfersPageContent() {
  const t = useTranslations('portfolio.internalTransfers');
  const searchParams = useSearchParams();

  // Lets the Accounts page's "Transfer history" link deep-link straight into
  // this account's exchange, e.g. /portfolio/internal-transfers?exchange=okx
  const exchangeParam = searchParams.get('exchange');

  const [selectedExchange, setSelectedExchange] = useState(
    exchangeParam && toExchangeId(exchangeParam) ? exchangeParam : 'all',
  );
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  // 🆕 Accounts the "New transfer" action may run on — same payload that feeds
  // the exchange filter above, narrowed to exchanges whose connector actually
  // implements wallet-to-wallet transfers. `id` is coerced through Number()
  // rather than trusted as a JSON number so a string PK can never silently
  // empty this list and leave the button dead.
  const [transferableAccounts, setTransferableAccounts] = useState<TransferFormAccount[]>(
    [],
  );
  const [pickAccountOpen, setPickAccountOpen] = useState(false);
  const [pickedAccountId, setPickedAccountId] = useState<string | undefined>(undefined);
  const [transferringAccount, setTransferringAccount] =
    useState<TransferFormAccount | null>(null);
  // Bumped after a transfer so the history table refetches.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchExchanges = async () => {
      try {
        const accountsResponse = await fetch('/api/accounts');
        if (accountsResponse.ok) {
          const accounts = await accountsResponse.json();
          const list: Array<{ id?: number; exchange?: string; accountId?: string }> =
            Array.isArray(accounts) ? accounts : [];

          const rawAccountExchanges = list
            .map((acc) => acc.exchange)
            .filter((exchange): exchange is string => Boolean(exchange));
          const uniqueAccountExchanges = Array.from(new Set<string>(rawAccountExchanges));
          const accountExchanges = uniqueAccountExchanges.filter(
            (exchange): exchange is string =>
              Boolean(exchange) && Boolean(toExchangeId(exchange)),
          );
          if (accountExchanges.length > 0) {
            setAvailableExchanges(accountExchanges);
          }

          const transferableAccounts = list
            .filter(
              (acc) =>
                typeof acc.exchange === 'string' &&
                typeof acc.accountId === 'string' &&
                TRANSFER_CAPABLE_EXCHANGES.has(acc.exchange.toLowerCase()),
            )
            .map((acc) => ({
              id: Number(acc.id),
              exchange: acc.exchange as string,
              accountId: acc.accountId as string,
            }))
            .filter((acc) => Number.isInteger(acc.id));

          setTransferableAccounts(transferableAccounts);
        }
      } catch (error) {
        console.error('Failed to fetch exchanges:', error);
      }
    };

    fetchExchanges();
  }, []);

  const handleExchangeChange = (value: string) => {
    setSelectedExchange(value);
  };

  const handleNewTransfer = () => {
    setPickedAccountId(undefined);
    setTransferringAccount(null);
    setPickAccountOpen(true);
  };

  const handleConfirmAccount = () => {
    const account = transferableAccounts.find(
      (candidate) => String(candidate.id) === pickedAccountId,
    );
    if (!account) return;

    setPickAccountOpen(false);
    setTransferringAccount(account);
  };

  return (
    <SidebarInset>
      <SiteHeader
        title={t('title')}
        links={
          <ExchangeSelector
            value={selectedExchange}
            onChange={handleExchangeChange}
            exchanges={availableExchanges}
          />
        }
      />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
            <div className="flex justify-end">
              <Button onClick={handleNewTransfer}>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {t('newTransfer')}
              </Button>
            </div>
            <InternalTransfersTable
              selectedExchange={selectedExchange}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      </div>

      <Dialog open={pickAccountOpen} onOpenChange={setPickAccountOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('pickAccount.title')}</DialogTitle>
            <DialogDescription>{t('pickAccount.description')}</DialogDescription>
          </DialogHeader>

          {transferableAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pickAccount.empty')}</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="transfer-account">{t('pickAccount.placeholder')}</Label>
              <Select value={pickedAccountId} onValueChange={setPickedAccountId}>
                <SelectTrigger id="transfer-account" className="w-full">
                  <SelectValue placeholder={t('pickAccount.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {transferableAccounts.map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {getExchangeDisplayName(candidate.exchange as SupportedExchange)} ·{' '}
                      {candidate.accountId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPickAccountOpen(false)}
              type="button"
            >
              {t('pickAccount.cancel')}
            </Button>
            <Button
              onClick={handleConfirmAccount}
              disabled={!pickedAccountId}
              type="button"
            >
              {t('pickAccount.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferForm
        open={!!transferringAccount}
        onOpenChange={(open) => {
          if (!open) setTransferringAccount(null);
        }}
        onSuccess={() => setRefreshKey((key) => key + 1)}
        account={transferringAccount}
      />
    </SidebarInset>
  );
}
