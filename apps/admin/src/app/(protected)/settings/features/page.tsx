import { FeatureSettingsPanel } from '@/components/feature-settings-panel';
import { requireStaffPermission } from '@/lib/auth-server';
import { getAdminFeatureSettings } from '@/lib/feature-settings-server';

export default async function FeatureSettingsPage() {
  const user = await requireStaffPermission('feature_settings.view');
  const settings = await getAdminFeatureSettings();
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
        Settings
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Feature controls
      </h1>
      <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
        Progressively roll out rental operations while keeping the public
        website, catalogue, security, audit, and SEO foundations permanently
        available.
      </p>
      <div className="mt-8">
        <FeatureSettingsPanel
          canManage={user.permissionKeys.includes('feature_settings.manage')}
          initial={settings}
        />
      </div>
    </div>
  );
}
