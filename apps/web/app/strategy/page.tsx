import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Strategy',
};
export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Strategy" />
      <div></div>
    </SidebarInset>
  );
}
