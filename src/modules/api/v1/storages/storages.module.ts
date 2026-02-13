import { Module } from '@nestjs/common';
import { ApiStoragesController } from './storages.controller';

@Module({
  controllers: [ApiStoragesController],
})
export class ApiStoragesModule {}
