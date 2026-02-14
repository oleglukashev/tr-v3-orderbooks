import { Module } from '@nestjs/common';
import { ApiClustersController } from './orderbooks.controller';

@Module({
  controllers: [ApiClustersController],
})
export class ApiClustersModule {}
