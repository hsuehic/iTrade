import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Market',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Market" />
      <div></div>
    </SidebarInset>
  );
}
