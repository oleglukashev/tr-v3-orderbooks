import { Module } from '@nestjs/common';
import { EntityModule } from './modules/entity-services/entities.module';
import { GrabTradesCommand } from './commands/grab-trades.command';
import { RedisModule } from '@nestjs-modules/ioredis';
import { GeneralPrismaModule } from './modules/generalPrisma/generalPrisma.module';
import { BidasksPrismaModule } from './modules/bidasksPrisma/bidasksPrisma.module';
import { BidasksStorageModule } from './modules/bidasks-storage/bidasks-storage.module';

@Module({
  imports: [
    GeneralPrismaModule,
    //KlinesPrismaModule,
    BidasksPrismaModule,
    RedisModule.forRoot(
      {
        type: 'single',
        url: 'redis://localhost:6379',
        options: { db: 5 },
      },
      'bidasksDb',
    ),
    BidasksStorageModule,
    EntityModule,
  ],
  providers: [GrabTradesCommand],
})
export class CliModule {}
