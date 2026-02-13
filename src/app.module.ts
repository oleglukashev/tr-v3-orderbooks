import { Module } from '@nestjs/common';
import { EntityModule } from './modules/entity-services/entities.module';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { ApiClustersModule } from './modules/api/v1/clusters/clusters.module';
//import { GenerateFppModule } from './modules/generate-fpp/generate-fpp.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiFppModule } from './modules/api/v1/fpp/fpp.module';
//import { RedisModule } from '@nestjs-modules/ioredis';
import { MoveClustersFromStorageToBdModule } from './modules/move-clusters-from-storage-to-bd/move-clusters-from-storage-to-bd.module';
import { GeneralPrismaModule } from './modules/generalPrisma/generalPrisma.module';
import { BidasksPrismaModule } from './modules/bidasksPrisma/bidasksPrisma.module';
// import { BullBoardModule } from '@bull-board/nestjs';
// import { ExpressAdapter } from '@bull-board/express';
// import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
// import { BullModule } from '@nestjs/bullmq';
import { BidasksStorageModule } from './modules/bidasks-storage/bidasks-storage.module';
import { WebsocketGatewayModule } from './modules/websocket-gateway/websocket-gateway.module';
import { ApiStoragesModule } from './modules/api/v1/storages/storages.module';

@Module({
  imports: [
    GeneralPrismaModule,
    //KlinesPrismaModule,
    BidasksPrismaModule,
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
    // BullModule.registerQueue({ name: 'bidasks' }),
    // BullBoardModule.forRoot({
    //   route: '/queues',
    //   adapter: ExpressAdapter,
    // }),
    // BullBoardModule.forFeature({
    //   name: 'bidasks',
    //   adapter: BullMQAdapter,
    // }),
    EntityModule,
    //GenerateFppModule,
    BidasksStorageModule,
    MoveClustersFromStorageToBdModule,
    ApiClustersModule,
    ApiFppModule,
    ApiStoragesModule,
    WebsocketGatewayModule,
  ],
  providers: [AppService],
})
export class AppModule {}
