import ccxt from 'ccxt';
import * as yargs from 'yargs';
import config from '../config/config.json';
import moment from 'moment';

import * as zlib from 'zlib';
import csv from 'csv-parser';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

//const MIN_INTERVAL = 60000;

import { CommandRunner, Command, Option } from 'nest-commander';
import { ClustersEntityService } from '../modules/entity-services/clusters-entity-service';
import { getStartTsByTf, startOfMinuteTs } from '../utils/time';
import { BidasksStorageService } from '../modules/bidasks-storage/bidasks-storage.service';

// @Injectable()
@Command({
  name: 'grab-trades',
  options: { isDefault: true },
  description: 'Grab trades',
})
export class GrabTradesCommand extends CommandRunner {
  constructor(
    private readonly bidasksStorageService: BidasksStorageService,
    private readonly clustersEntityService: ClustersEntityService,
  ) {
    super();
  }

  @Option({ flags: '--symbol [string]' })
  parseSymbol(value: string): string {
    return value;
  }

  @Option({ flags: '--startDate [string]' })
  parseStartTs(value: string): string {
    return value;
  }

  @Option({ flags: '--endDate [string]' })
  parseEndTs(value: string): string {
    return value;
  }

  async run(passedParams, options) {
    const argv: any = yargs.argv;
    //const tradingServiceId: string = argv['tradingServiceId'];
    const tradingServiceId = '2';
    //const selectedTf: string = argv['tf'];
    const tradingServiceData = config[tradingServiceId];
    const ccxtProClass = ccxt[tradingServiceData.name];
    if (!ccxtProClass) {
      throw new Error(`No exchnage ${argv.exchange} in ccxt pro`);
    }

    const pairIdBySymbol: any = {};
    const symbols = [];

    for (const pairId in tradingServiceData.types.future.tickers) {
      const symbol = tradingServiceData.types.future.tickers[pairId].symbol;
      //const tickerAnswerSymbol = tradingServiceData.types.future.tickers[pairId].tickerAnswerSymbol;
      symbols.push(symbol);
      pairIdBySymbol[symbol] = pairId;
    }

    for (const symbol of symbols) {
      if (symbol !== options.symbol) {
        continue;
      }

      await this.fetchAndSave({
        pairId: parseInt(pairIdBySymbol[symbol]),
        symbol,
        tradingServiceData,
        startDate: options.startDate,
        endDate: options.endDate,
      });
    }

    console.log('Complete');
  }

  async fetchAndSave({
    pairId,
    symbol,
    tradingServiceData,
    startDate,
    endDate,
  }: any) {
    const dates = this.timePeriodsArray(startDate, endDate, 'day');
    for (const date of dates) {
      const url = `https://public.bybit.com/trading/${symbol}/${symbol}${date}.csv.gz`;
      console.log('url: ', url);
      console.log(
        `date: ${date}, trades process start:`,
        moment().format('HH:mm.ss'),
      );
      let tradesCount = 0;
      for await (const trade of this.importFromGzUrl(url)) {
        // await saveToDb(row);

        // if cluster precision config exist
        if (tradingServiceData.types.future.tickers[pairId].clusterPrecision) {
          for (const tfAsString in tradingServiceData.types.future.tickers[
            pairId
          ].clusterPrecision) {
            const tf = parseInt(tfAsString);
            const clusterSize =
              tradingServiceData.types.future.tickers[pairId].clusterPrecision[
                tfAsString
              ];
            const data: any = this.prepareTrade(trade);
            this.bidasksStorageService.processTrade(
              data,
              tf,
              pairId,
              clusterSize,
            );
          }
        }

        tradesCount++;
      }
      console.log(
        `date: ${date}, trades count: ${tradesCount}, trades process end:`,
        moment().format('HH:mm.ss'),
      );
      await this.moveDataFromRedisToBd(pairId, date);
    }
  }

  private prepareTrade(trade: any) {
    return {
      timestamp: Number(parseInt(trade.timestamp) * 1000),
      amount: trade.side === 'Buy' ? Number(trade.size) : Number(-trade.size),
      price: trade.price,
      side:
        trade.side === 'Buy' ? 'buy' : trade.side === 'Sell' ? 'sell' : 'sell',
    };
  }

  private async *importFromGzUrl(url: string): AsyncGenerator<any> {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    // fetch → Node stream
    const source = Readable.fromWeb(response.body as any);

    const gunzip = zlib.createGunzip();
    const parser = csv();

    const rows: any[] = [];
    parser.on('data', (row) => rows.push(row));

    // pipeline запускаем асинхронно
    const pipePromise = pipeline(source, gunzip, parser);

    // отдаём строки по мере поступления
    while (true) {
      if (rows.length > 0) {
        yield rows.shift();
      } else {
        // если pipeline завершён и данных больше нет — выходим
        if (parser.readableEnded) break;
        await new Promise((r) => setImmediate(r));
      }
    }

    await pipePromise;
  }

  private timePeriodsArray(
    startDate: Date | string,
    endDate: Date | string,
    periodType: any = 'day',
    periodSize = 1,
    format = 'YYYY-MM-DD',
  ): string[] {
    const result: string[] = [];
    const current = moment.utc(startDate);
    const end = moment.utc(endDate);

    while (current.isBefore(end, periodType)) {
      result.push(current.format(format));
      current.add(periodSize, periodType);
    }

    return result;
  }

  private async moveDataFromRedisToBd(pairId: number, date: string) {
    const minutes = this.timePeriodsArray(
      `${date} 00:00:00`,
      `${date} 23:59:59`,
      'minute',
      5,
      'YYYY-MM-DD HH:mm:ss',
    );

    for (const minute of minutes) {
      const minuteUtc = moment(minute, 'YYYY-MM-DD HH:mm:ss').utc().valueOf();

      // await this.moveClusterFromRedisToBdByTf(
      //   1,
      //   minuteUtc,
      // );

      if (minuteUtc === getStartTsByTf(minuteUtc, 5)) {
        await this.moveBidasksFromStorageToBdByTf(5, minuteUtc, pairId);
      }

      if (minuteUtc === getStartTsByTf(minuteUtc, 15)) {
        await this.moveBidasksFromStorageToBdByTf(15, minuteUtc, pairId);
      }

      if (minuteUtc === getStartTsByTf(minuteUtc, 30)) {
        await this.moveBidasksFromStorageToBdByTf(30, minuteUtc, pairId);
      }

      if (minuteUtc === getStartTsByTf(minuteUtc, 60)) {
        await this.moveBidasksFromStorageToBdByTf(60, minuteUtc, pairId);
      }

      if (minuteUtc === getStartTsByTf(minuteUtc, 240)) {
        await this.moveBidasksFromStorageToBdByTf(240, minuteUtc, pairId);
      }
    }
  }

  async moveBidasksFromStorageToBdByTf(
    tf: number,
    minuteUtc: number,
    pairId: number,
  ) {
    let storageBidasks = this.bidasksStorageService.finished(tf, minuteUtc);
    storageBidasks = storageBidasks.filter(
      (bidask) => bidask.pairId === pairId,
    );

    for (const bidask of storageBidasks) {
      await this.clustersEntityService.createOrUpdateBidask(bidask);
      this.bidasksStorageService.deleteByBidask(bidask);
    }
  }
}
