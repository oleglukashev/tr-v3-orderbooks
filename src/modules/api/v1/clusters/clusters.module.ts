import { Module } from '@nestjs/common';
import { ApiClustersController } from './clusters.controller';

@Module({
  controllers: [ApiClustersController],
})
export class ApiClustersModule {}
