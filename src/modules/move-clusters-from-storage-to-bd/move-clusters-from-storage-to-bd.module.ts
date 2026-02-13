import { Module } from '@nestjs/common';
import { MoveClustersFromStorageToBdCronService } from './move-clusters-from-storage-to-bd.cron.service';

@Module({
  providers: [MoveClustersFromStorageToBdCronService],
  exports: [MoveClustersFromStorageToBdCronService],
})
export class MoveClustersFromStorageToBdModule {}
