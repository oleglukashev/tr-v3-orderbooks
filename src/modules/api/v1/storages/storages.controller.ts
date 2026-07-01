import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { OrderbooksStorageService } from '../../../orderbooks-storage/orderbooks-storage.service';
import { DepthStorageService } from '../../../depth-storage/depth-storage.service';

@ApiTags('Storages')
@Controller({ path: 'api/v1/storages' })
export class ApiStoragesController {
  constructor(
    private readonly bidasksStorageService: OrderbooksStorageService,
    private readonly depthStorageService: DepthStorageService,
  ) {}

  @Get('orderbooks')
  @ApiOkResponse({ description: 'Bidasks storage entries' })
  @HttpCode(HttpStatus.OK)
  getBidasks(): any {
    return this.bidasksStorageService.getStore();
  }

  @Get('depth')
  @ApiOkResponse({
    description:
      'Raw top-N order books per pairId ({ bids, asks }) for effective-price / VWAP sizing.',
  })
  @HttpCode(HttpStatus.OK)
  getDepth(): any {
    return this.depthStorageService.getBooks();
  }
}
