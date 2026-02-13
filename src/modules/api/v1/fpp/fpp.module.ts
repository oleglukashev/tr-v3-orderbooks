import { Module } from '@nestjs/common';
import { ApiFppController } from './fpp.controller';

@Module({
  imports: [],
  controllers: [ApiFppController],
})
export class ApiFppModule {}
