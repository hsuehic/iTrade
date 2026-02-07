'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { JsonEditor } from '@/components/json-editor';
import { useTranslations } from 'next-intl';

interface StrategyConfigViewProps {
  parameters?: any;
  subscription?: any;
  initialDataConfig?: any;
}

export function StrategyConfigView({
  parameters,
  subscription,
  initialDataConfig,
}: StrategyConfigViewProps) {
  const t = useTranslations('strategy.config');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="col-span-2 md:col-span-1">
        <CardHeader>
          <CardTitle>{t('parametersTitle')}</CardTitle>
          <CardDescription>{t('parametersDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <JsonEditor
            value={JSON.stringify(parameters || {}, null, 2)}
            onChange={() => {}}
            readOnly={true}
            className="h-[300px]"
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 col-span-2 md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>{t('subscriptionTitle')}</CardTitle>
            <CardDescription>{t('subscriptionDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <JsonEditor
              value={JSON.stringify(subscription || {}, null, 2)}
              onChange={() => {}}
              readOnly={true}
              className="h-[120px]"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('initialDataTitle')}</CardTitle>
            <CardDescription>{t('initialDataDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <JsonEditor
              value={JSON.stringify(initialDataConfig || {}, null, 2)}
              onChange={() => {}}
              readOnly={true}
              className="h-[120px]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
