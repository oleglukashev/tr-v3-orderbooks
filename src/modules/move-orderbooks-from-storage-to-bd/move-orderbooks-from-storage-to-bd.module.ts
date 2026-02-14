import { Module } from '@nestjs/common';
import { MoveOrderbooksFromStorageToBdCronService } from './move-orderbooks-from-storage-to-bd.cron.service';

@Module({
  providers: [MoveOrderbooksFromStorageToBdCronService],
  exports: [MoveOrderbooksFromStorageToBdCronService],
})
export class MoveOrderbooksFromStorageToBdModule {}
