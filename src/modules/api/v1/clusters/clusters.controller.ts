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
import { ClustersEntityService } from '../../../entity-services/clusters-entity-service';
import { BidasksStorageService } from '../../../bidasks-storage/bidasks-storage.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller({ path: 'api/v1/clusters' })
export class ApiClustersController {
  constructor(
    private readonly clustersEntityService: ClustersEntityService,
    private readonly bidasksStorageService: BidasksStorageService,
  ) {}

  @Get('')
  @ApiOkResponse({ description: 'List of clusters' })
  @HttpCode(HttpStatus.OK)
  public async index(
    @Query('pairId', new DefaultValuePipe(false), ParseIntPipe) pairId,
    @Query('tf', new DefaultValuePipe(false), ParseIntPipe) tf,
    @Query('page', new DefaultValuePipe(false), ParseIntPipe) page,
    @Query('limit', new DefaultValuePipe(false), ParseIntPipe) limit,
  ): Promise<any> {
    return this.clustersEntityService.findMany({
      where: {
        pairId,
        tf,
      },
      orderBy: { ts: 'desc' },
      page,
      take: limit,
    });
  }

  @Get('by_pair_id_and_tf_and_ts')
  @ApiOkResponse({ description: 'Get kline by pair_id, tf and ts' })
  @HttpCode(HttpStatus.OK)
  public async byPairIdAndTfAndTs(
    @Query('pairId', new DefaultValuePipe(false), ParseIntPipe) pairId,
    @Query('tf', new DefaultValuePipe(false), ParseIntPipe) tf,
    @Query('ts', new DefaultValuePipe(false), ParseIntPipe) ts,
  ): Promise<any> {
    let cluster = await this.clustersEntityService.findFirst({
      where: {
        pairId: { equals: pairId },
        tf: { equals: tf },
        ts: { equals: ts },
      },
    });

    if (!cluster || !Object.keys(cluster.data).length) {
      const storageBidask = this.bidasksStorageService.getBidask(
        pairId,
        tf,
        ts,
      );

      if (storageBidask) {
        cluster = storageBidask;
      } else {
        throw new NotFoundException('Cluster not found');
      }
    }

    return cluster;
  }
}
