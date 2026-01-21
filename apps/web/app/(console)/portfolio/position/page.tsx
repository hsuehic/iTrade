import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Position',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Position" />
      <div></div>
    </SidebarInset>
  );
}
