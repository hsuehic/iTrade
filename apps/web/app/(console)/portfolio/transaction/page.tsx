import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Transaction',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Transaction" />
      <div></div>
    </SidebarInset>
  );
}
