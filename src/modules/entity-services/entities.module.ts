import { Global, Module } from '@nestjs/common';
import { ClustersEntityService } from './clusters-entity-service';
import { FppEntityService } from './fpp-entity-service';
import { PairsEntityService } from './pairs-entity-service';

@Global()
@Module({
  providers: [ClustersEntityService, FppEntityService, PairsEntityService],
  exports: [ClustersEntityService, FppEntityService, PairsEntityService],
})
export class EntityModule {}
