'use client';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { SecuritySettings } from '@/components/settings/security-settings';
import { EmailPreferencesSettings } from '@/components/settings/email-preferences-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { DangerZone } from '@/components/settings/danger-zone';
import {
  IconUser,
  IconLock,
  IconMail,
  IconPalette,
  IconAlertTriangle,
} from '@tabler/icons-react';

export default function SettingsPage() {
  return (
    <SidebarInset>
      <SiteHeader title="Settings" />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-6 py-6 px-4 lg:px-6">
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="mb-6 flex-wrap h-auto gap-1">
                <TabsTrigger value="profile" className="gap-2">
                  <IconUser className="size-4" />
                  <span className="hidden sm:inline">Profile</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="gap-2">
                  <IconLock className="size-4" />
                  <span className="hidden sm:inline">Security</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-2">
                  <IconMail className="size-4" />
                  <span className="hidden sm:inline">Notifications</span>
                </TabsTrigger>
                <TabsTrigger value="appearance" className="gap-2">
                  <IconPalette className="size-4" />
                  <span className="hidden sm:inline">Appearance</span>
                </TabsTrigger>
                <TabsTrigger value="danger" className="gap-2 text-destructive">
                  <IconAlertTriangle className="size-4" />
                  <span className="hidden sm:inline">Danger Zone</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile">
                <ProfileSettings />
              </TabsContent>

              <TabsContent value="security">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="notifications">
                <EmailPreferencesSettings />
              </TabsContent>

              <TabsContent value="appearance">
                <AppearanceSettings />
              </TabsContent>

              <TabsContent value="danger">
                <DangerZone />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
