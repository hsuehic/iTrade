import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Backtest',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Backtest" />
      <div></div>
    </SidebarInset>
  );
}
