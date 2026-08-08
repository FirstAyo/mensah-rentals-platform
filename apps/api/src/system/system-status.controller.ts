import { Controller, Get, Inject, UseInterceptors } from '@nestjs/common';
import type { PermissionKey } from '@mensah-rentals/rbac';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PrivateNoStoreInterceptor } from '../common/private-no-store.interceptor';
import { SystemStatusService } from './system-status.service';

const OBSERVABILITY_VIEW = 'observability.view' as PermissionKey;
const BACKUP_STATUS_VIEW = 'backup.view_status' as PermissionKey;

@Controller('admin/system')
@UseInterceptors(PrivateNoStoreInterceptor)
export class SystemStatusController {
  constructor(
    @Inject(SystemStatusService)
    private readonly system: SystemStatusService,
  ) {}

  @Get('status')
  @RequirePermissions(OBSERVABILITY_VIEW)
  status() {
    return this.system.status();
  }

  @Get('backup-status')
  @RequirePermissions(BACKUP_STATUS_VIEW)
  async backupStatus() {
    return {
      generatedAt: new Date().toISOString(),
      ...(await this.system.backupStatus()),
    };
  }
}
