import { Module } from '@nestjs/common';
import { EntityModule } from './modules/entity-services/entities.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { GeneralPrismaModule } from './modules/generalPrisma/generalPrisma.module';
import { OrderbooksPrismaModule } from './modules/orderbooksPrisma/orderbooksPrisma.module';
import { OrderbooksStorageModule } from './modules/orderbooks-storage/orderbooks-storage.module';

@Module({
  imports: [
    GeneralPrismaModule,
    //KlinesPrismaModule,
    OrderbooksPrismaModule,
    RedisModule.forRoot(
      {
        type: 'single',
        url: 'redis://localhost:6379',
        options: { db: 5 },
      },
      'bidasksDb',
    ),
    OrderbooksStorageModule,
    EntityModule,
  ],
  providers: [],
})
export class CliModule {}
