import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Balance',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Backtest" />
      <div></div>
    </SidebarInset>
  );
}
