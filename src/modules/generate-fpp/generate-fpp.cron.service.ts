import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import moment from 'moment';
import yargs from 'yargs';
import config from '../../config/config.json';
import { GenerateFppService } from './generate-fpp.service';
import { getStartTsByTf, startOfMinuteTs } from '../../utils/time';
import sleep from '../../utils/sleep';

@Injectable()
export class GenerateFppCronService {
  constructor(private readonly generateFppService: GenerateFppService) {}

  @Cron('* * * * *')
  async handleEveryMinuteCron() {
    const argv: any = yargs.argv;
    const tradingServiceId: string = argv['tradingServiceId'];
    const tradingServiceData = config[tradingServiceId];
    const now = startOfMinuteTs();
    await sleep(10000);
    for (const pairId in tradingServiceData.types.future.tickers) {
      await this.generateFppService.processFpp(parseInt(pairId), 1);

      if (now === getStartTsByTf(now, 5)) {
        await this.generateFppService.processFpp(parseInt(pairId), 5);
      }

      if (now === getStartTsByTf(now, 15)) {
        await this.generateFppService.processFpp(parseInt(pairId), 15);
      }

      if (now === getStartTsByTf(now, 30)) {
        await this.generateFppService.processFpp(parseInt(pairId), 30);
      }

      if (now === getStartTsByTf(now, 60)) {
        await this.generateFppService.processFpp(parseInt(pairId), 60);
      }

      if (now === getStartTsByTf(now, 240)) {
        await this.generateFppService.processFpp(parseInt(pairId), 240);
      }
    }
  }
}
