import { Global, Module } from '@nestjs/common';
import { DepthStorageService } from './depth-storage.service';

@Global()
@Module({
  providers: [DepthStorageService],
  exports: [DepthStorageService],
})
export class DepthStorageModule {}
