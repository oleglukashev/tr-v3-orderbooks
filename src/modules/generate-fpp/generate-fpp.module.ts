import { Module } from '@nestjs/common';
import { GenerateFppService } from './generate-fpp.service';
import { GenerateFppCronService } from './generate-fpp.cron.service';

@Module({
  providers: [GenerateFppService, GenerateFppCronService],
  exports: [GenerateFppService, GenerateFppCronService],
})
export class GenerateFppModule {}
