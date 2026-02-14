import { Module } from '@nestjs/common';
import { EntityModule } from './modules/entity-services/entities.module';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { ApiClustersModule } from './modules/api/v1/orderbooks/orderbooks.module';
//import { GenerateFppModule } from './modules/generate-fpp/generate-fpp.module';
import { ScheduleModule } from '@nestjs/schedule';
//import { RedisModule } from '@nestjs-modules/ioredis';
import { MoveOrderbooksFromStorageToBdModule } from './modules/move-orderbooks-from-storage-to-bd/move-orderbooks-from-storage-to-bd.module';
import { GeneralPrismaModule } from './modules/generalPrisma/generalPrisma.module';
import { OrderbooksPrismaModule } from './modules/orderbooksPrisma/orderbooksPrisma.module';
// import { BullBoardModule } from '@bull-board/nestjs';
// import { ExpressAdapter } from '@bull-board/express';
// import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
// import { BullModule } from '@nestjs/bullmq';
import { OrderbooksStorageModule } from './modules/orderbooks-storage/orderbooks-storage.module';
import { WebsocketGatewayModule } from './modules/websocket-gateway/websocket-gateway.module';
import { ApiStoragesModule } from './modules/api/v1/storages/storages.module';

@Module({
  imports: [
    GeneralPrismaModule,
    //KlinesPrismaModule,
    OrderbooksPrismaModule,
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    // RedisModule.forRoot(
    //   {
    //     type: 'single',
    //     url: 'redis://localhost:6379',
    //     options: { db: 5 },
    //   },
    //   'bidasksDb',
    // ),
    // BullModule.forRoot({
    //   prefix: 'tr_v3_bidasks',
    //   connection: {
    //     host: 'localhost',
    //     port: 6379,
    //     db: 5,
    //   },
    // }),
    // BullModule.registerQueue({ name: 'orderbooks' }),
    // BullBoardModule.forRoot({
    //   route: '/queues',
    //   adapter: ExpressAdapter,
    // }),
    // BullBoardModule.forFeature({
    //   name: 'orderbooks',
    //   adapter: BullMQAdapter,
    // }),
    EntityModule,
    //GenerateFppModule,
    OrderbooksStorageModule,
    MoveOrderbooksFromStorageToBdModule,
    ApiClustersModule,
    ApiStoragesModule,
    WebsocketGatewayModule,
  ],
  providers: [AppService],
})
export class AppModule {}
