import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata = {
  title: 'Dry run',
};
export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Dry run" />
      <div></div>
    </SidebarInset>
  );
}
