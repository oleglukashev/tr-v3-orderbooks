import { Global, Module } from '@nestjs/common';
import { OrderbooksStorageService } from './orderbooks-storage.service';

@Global()
@Module({
  providers: [OrderbooksStorageService],
  exports: [OrderbooksStorageService],
})
export class OrderbooksStorageModule {}
