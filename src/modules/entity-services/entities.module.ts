import { Global, Module } from '@nestjs/common';
import { OrderbooksEntityService } from './orderbooks-entity-service';
import { PairsEntityService } from './pairs-entity-service';

@Global()
@Module({
  providers: [OrderbooksEntityService, PairsEntityService],
  exports: [OrderbooksEntityService, PairsEntityService],
})
export class EntityModule {}
