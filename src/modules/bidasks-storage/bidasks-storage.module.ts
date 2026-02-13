import { Global, Module } from '@nestjs/common';
import { BidasksStorageService } from './bidasks-storage.service';

@Global()
@Module({
  providers: [BidasksStorageService],
  exports: [BidasksStorageService],
})
export class BidasksStorageModule {}
