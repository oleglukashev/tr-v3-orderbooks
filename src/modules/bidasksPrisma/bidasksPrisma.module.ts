import { Global, Module } from '@nestjs/common';
import { BidasksPrismaService } from './bidasksPrisma.service';

@Global()
@Module({
  providers: [BidasksPrismaService],
  exports: [BidasksPrismaService],
})
export class BidasksPrismaModule {}
