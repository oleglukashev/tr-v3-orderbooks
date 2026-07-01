import { Injectable } from '@nestjs/common';
import yargs from 'yargs';
import config from './config/config.json';
import ccxt from 'ccxt';
import * as process from 'node:process';
import sentToBot from './utils/bot';
import { PairsEntityService } from './modules/entity-services/pairs-entity-service';
import { OrderbooksStorageService } from './modules/orderbooks-storage/orderbooks-storage.service';
import { DepthStorageService } from './modules/depth-storage/depth-storage.service';
import sleep from './utils/sleep';
import { WebsocketStreamService } from './modules/websocket-gateway/websocket-stream.service';
import { nowTs } from './utils/time';

@Injectable()
export class AppService {
  constructor(
    private readonly pairsEntityService: PairsEntityService,
    private readonly orderbooksStorageService: OrderbooksStorageService,
    private readonly depthStorageService: DepthStorageService,
    private readonly websocketStreamService: WebsocketStreamService,
  ) {}

  //times: any = {};

  async init(): Promise<any> {
    await this.initTradesProcess();
    this.orderbooksStream();
  }

  // Which trading services to collect orderbooks for:
  //   ORDERBOOK_TRADING_SERVICES="1,2,3"  → that explicit list
  //   --tradingServiceId=2                → just that one (backward compatible)
  //   otherwise                          → every service present in config.json
  // Running them in one process keeps a single aggregated depth store (and thus one WS snapshot
  // with every exchange) instead of fragmenting it across per-exchange processes.
  private resolveTradingServiceIds(argv: any): string[] {
    const fromEnv = process.env.ORDERBOOK_TRADING_SERVICES;
    if (fromEnv) {
      return fromEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (argv['tradingServiceId'] != null) {
      return [String(argv['tradingServiceId'])];
    }
    return Object.keys(config);
  }

  private async initTradesProcess() {
    const argv: any = yargs.argv;
    const ids = this.resolveTradingServiceIds(argv);
    console.log(`[orderbook] collecting for trading services: ${ids.join(', ')}`);
    // Each exchange runs independently; one failing to connect must not stop the others.
    for (const id of ids) {
      this.initExchange(String(id)).catch((err) =>
        console.error(`[orderbook] TS=${id} init failed: ${err.message}`),
      );
    }
  }

  private async initExchange(tradingServiceId: string) {
    const tradingServiceData = config[tradingServiceId];
    if (!tradingServiceData) {
      console.error(`[orderbook] no config entry for TS=${tradingServiceId}`);
      return;
    }
    const ccxtProClass = ccxt.pro[tradingServiceData.name];
    if (!ccxtProClass) {
      console.error(
        `[orderbook] TS=${tradingServiceId}: no ccxt.pro exchange "${tradingServiceData.name}"`,
      );
      return;
    }

    const exchange = new ccxtProClass({
      enableRateLimit: true,
      apiKey: process.env.API_KEY,
      secret: process.env.API_SECRET,
      options: {
        defaultType: 'linear', // Устанавливаем тип рынка на фьючерсный
      },
    });

    // Only this exchange's own pairs (pairId is unique per trading service). Without the
    // tradingServiceId filter every process would try to watch all services' pairs on one exchange.
    const pairsForbidasks = await this.pairsEntityService.findMany({
      where: {
        activated: true,
        isUsedToBidasks: true,
        tradingServiceId: Number(tradingServiceId),
      },
    });

    await exchange.loadMarkets();

    const times = {};
    let watched = 0;
    const skipped: string[] = [];
    for (const pair of pairsForbidasks) {
      // Skip pairs the exchange doesn't list, so we don't spin a forever-failing watch loop.
      const changedSymbol = pair.symbol.replace('USDT', '/USDT:USDT');
      if (exchange.markets && !exchange.markets[changedSymbol]) {
        skipped.push(pair.symbol);
        continue;
      }
      times[pair.id] = nowTs();
      this.watchOrderbookProcess({ exchange, pair, times });
      watched++;
    }

    console.log(
      `[orderbook] TS=${tradingServiceId} (${tradingServiceData.name}): watching ${watched}/${pairsForbidasks.length} pairs` +
        (skipped.length ? `, skipped: ${skipped.join(', ')}` : ''),
    );
  }

  // private async watchTradesProcess({ exchange, pair }: any) {
  //   const pairId = pair.id;

  //   while (true) {
  //     let trades: any[] = [];
  //     try {
  //       trades = await exchange.watchTrades(pair.symbol);
  //     } catch (error: any) {
  //       console.error('WebSocket connection error:', error.message);
  //       console.log('Reconnecting in 1 second...');
  //       await sentToBot(`orderbooks microservice: ${pair.symbol} - ${error.message}`);
  //       await new Promise((resolve) => setTimeout(resolve, 1000));
  //     }

  //     if (pair.clusterPrecision) {
  //       for (const tfAsString in pair.clusterPrecision) {
  //         const tf = parseInt(tfAsString);
  //         if (tf !== 5) {
  //           continue;
  //         }

  //         const clusterSize = pair.clusterPrecision[tfAsString];

  //         for (const trade of trades) {
  //           this.bidasksStorageService.processTrade(trade, tf, pairId, clusterSize);
  //         }
  //       }
  //     }
  //   }
  // }

  private async watchOrderbookProcess({ exchange, pair, times }: any) {
    while (true) {
      try {
        const changedSymbol = pair.symbol.replace('USDT', '/USDT:USDT');
        const data = await exchange.watchOrderBook(changedSymbol, 1000);
        const now = nowTs();

        // Accept data every 5 sec only
        if (now - times[pair.id] < 5000) {
          continue;
        }

        times[pair.id] = now;

        // Phase 1: keep the latest raw L2 book for executable-liquidity / slippage sizing.
        // Independent of clusterPrecision so it works for every watched pair.
        this.depthStorageService.setDepth(pair.id, data.bids, data.asks, now);

        if (pair.clusterPrecision) {
          for (const tfAsString in pair.clusterPrecision) {
            const tf = parseInt(tfAsString);
            if (tf !== 5) {
              continue;
            }

            const clusterSize = pair.clusterPrecision[tfAsString];
            //console.log('data', data);
            this.orderbooksStorageService.processOrderbook(
              data,
              5,
              pair.id,
              clusterSize,
            );
          }
        }
      } catch (error: any) {
        console.error('Orderbook WebSocket connection error:', error.message);
        console.log('Reconnecting in 1 second...');
        await sentToBot(
          `orderbook microservice: ${pair.symbol} - ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async orderbooksStream() {
    while (true) {
      const orderbooks: any[] = this.orderbooksStorageService.entries();
      this.websocketStreamService.emitOrderbooks(orderbooks);
      await sleep(5000);
    }
  }
}
