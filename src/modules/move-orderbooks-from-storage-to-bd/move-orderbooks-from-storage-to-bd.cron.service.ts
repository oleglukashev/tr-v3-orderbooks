import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getStartTsByTf, startOfMinuteTs } from '../../utils/time';
import { OrderbooksEntityService } from '../entity-services/orderbooks-entity-service';

@Injectable()
export class MoveOrderbooksFromStorageToBdCronService {
  constructor(
    private readonly orderbooksEntityService: OrderbooksEntityService,
  ) {}

  @Cron('* * * * *')
  async handleEveryMinuteCron() {
    const now = startOfMinuteTs();
    //await this.clustersEntityService.moveOrderbooksFromStorageToBdByTf(1);

    if (now === getStartTsByTf(now, 5)) {
      await this.orderbooksEntityService.moveOrderbooksFromStorageToBdByTf(5);
    }

    // if (now === getStartTsByTf(now, 15)) {
    //   await this.clustersEntityService.moveBidasksFromStorageToBdByTf(15);
    // }
    //
    // if (now === getStartTsByTf(now, 30)) {
    //   await this.clustersEntityService.moveBidasksFromStorageToBdByTf(30);
    // }
    //
    // if (now === getStartTsByTf(now, 60)) {
    //   await this.clustersEntityService.moveBidasksFromStorageToBdByTf(60);
    // }
    //
    // if (now === getStartTsByTf(now, 240)) {
    //   await this.clustersEntityService.moveBidasksFromStorageToBdByTf(240);
    // }
  }
}
