import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  HttpStatus,
  Query,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { OrderbooksEntityService } from '../../../entity-services/orderbooks-entity-service';
import { OrderbooksStorageService } from '../../../orderbooks-storage/orderbooks-storage.service';
import { getStartTsByTf, nowTs } from '../../../../utils/time';

@ApiTags('Products')
@ApiBearerAuth()
@Controller({ path: 'api/v1/orderbooks' })
export class ApiClustersController {
  constructor(
    private readonly orderbooksEntityService: OrderbooksEntityService,
    private readonly orderbooksStorageService: OrderbooksStorageService,
  ) {}

  @Get('')
  @ApiOkResponse({ description: 'List of orderbooks' })
  @HttpCode(HttpStatus.OK)
  public async index(
    @Query('pairId', new DefaultValuePipe(false), ParseIntPipe) pairId,
    @Query('tf', new DefaultValuePipe(false), ParseIntPipe) tf,
    @Query('page', new DefaultValuePipe(false), ParseIntPipe) page,
    @Query('limit', new DefaultValuePipe(false), ParseIntPipe) limit,
  ): Promise<any> {
    const res = await this.orderbooksEntityService.findMany({
      where: {
        pairId,
        tf,
      },
      orderBy: { ts: 'desc' },
      page,
      take: limit,
    });

    const ts = getStartTsByTf(nowTs(), 5);

    const storageOrderbook = this.orderbooksStorageService.getOrderbook(
      pairId,
      tf,
      ts,
    );

    res.items.push(storageOrderbook);
    return res;
  }

  @Get('by_pair_id_and_tf_and_ts')
  @ApiOkResponse({ description: 'Get kline by pair_id, tf and ts' })
  @HttpCode(HttpStatus.OK)
  public async byPairIdAndTfAndTs(
    @Query('pairId', new DefaultValuePipe(false), ParseIntPipe) pairId,
    @Query('tf', new DefaultValuePipe(false), ParseIntPipe) tf,
    @Query('ts', new DefaultValuePipe(false), ParseIntPipe) ts,
  ): Promise<any> {
    let cluster = await this.orderbooksEntityService.findFirst({
      where: {
        pairId: { equals: pairId },
        tf: { equals: tf },
        ts: { equals: ts },
      },
    });

    if (!cluster || !Object.keys(cluster.data).length) {
      const storageBidask = this.orderbooksStorageService.getOrderbook(
        pairId,
        tf,
        ts,
      );

      if (storageBidask) {
        cluster = storageBidask;
      } else {
        throw new NotFoundException('Orerbook not found');
      }
    }

    return cluster;
  }
}
