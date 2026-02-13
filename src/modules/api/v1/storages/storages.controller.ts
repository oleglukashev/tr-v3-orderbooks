import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { BidasksStorageService } from '../../../bidasks-storage/bidasks-storage.service';

@ApiTags('Storages')
@Controller({ path: 'api/v1/storages' })
export class ApiStoragesController {
  constructor(private readonly bidasksStorageService: BidasksStorageService) {}

  @Get('bidasks')
  @ApiOkResponse({ description: 'Bidasks storage entries' })
  @HttpCode(HttpStatus.OK)
  getBidasks(): any {
    return this.bidasksStorageService.getStore();
  }
}
