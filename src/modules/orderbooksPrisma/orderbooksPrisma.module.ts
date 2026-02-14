import { Global, Module } from '@nestjs/common';
import { OrderbooksPrismaService } from './orderbooksPrisma.service';

@Global()
@Module({
  providers: [OrderbooksPrismaService],
  exports: [OrderbooksPrismaService],
})
export class OrderbooksPrismaModule {}
