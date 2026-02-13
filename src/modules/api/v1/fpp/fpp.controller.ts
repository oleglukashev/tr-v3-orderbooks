import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  HttpStatus,
  Query,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
} from '@nestjs/common';
import { FppEntityService } from '../../../entity-services/fpp-entity-service';

@ApiTags('Fpp')
@ApiBearerAuth()
@Controller({ path: 'api/v1/fpp' })
export class ApiFppController {
  constructor(private readonly fppEntityService: FppEntityService) {}

  @Get('')
  @ApiOkResponse({ description: 'List of fpp' })
  @HttpCode(HttpStatus.OK)
  public async byIds(
    @Query('pairId', new DefaultValuePipe(false), ParseIntPipe) pairId,
    @Query('tf', new DefaultValuePipe(false), ParseIntPipe) tf,
    @Query('page', new DefaultValuePipe(false), ParseIntPipe) page,
    @Query('limit', new DefaultValuePipe(false), ParseIntPipe) limit,
  ): Promise<any> {
    return this.fppEntityService.findMany({
      where: {
        pairId,
        tf,
      },
      orderBy: { ts: 'desc' },
      page,
      take: limit,
    });
  }
}
