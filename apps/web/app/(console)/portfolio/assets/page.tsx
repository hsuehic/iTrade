import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Assets',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Assets" />
      <div></div>
    </SidebarInset>
  );
}
