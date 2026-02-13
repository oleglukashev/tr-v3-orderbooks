import { Global, Module } from '@nestjs/common';
import { GeneralPrismaService } from './generalPrisma.service';

@Global()
@Module({
  providers: [GeneralPrismaService],
  exports: [GeneralPrismaService],
})
export class GeneralPrismaModule {}
