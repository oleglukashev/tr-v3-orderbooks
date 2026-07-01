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

// watchOrderBook depth limit per exchange — several exchanges only accept a fixed set of values
// (e.g. htx: 5/20/150/400) and throw otherwise. We only keep the top ~60 levels client-side, so a
// moderate depth is plenty. Unlisted exchanges pass `undefined` → ccxt's own default (always valid).
const ORDERBOOK_LIMIT_BY_EXCHANGE: Record<string, number> = {
  htx: 150,
  bybit: 200,
  okx: 400,
};

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

  // config (configs/base.json style, shared with tr-v3-klines-client):
  //   tradingServices: { name: id }  — exchanges we can run + their trading_service id
  //   names:           [ "BTCUSDT", ... ]  — the pair set to collect
  // Which exchanges to actually run (by name):
  //   ORDERBOOK_TRADING_SERVICES="bybit,mexc" (names or ids) → that subset
  //   --tradingServiceId=2                                   → just that one
  //   otherwise                                              → every exchange in tradingServices
  // Running them in one process keeps a single aggregated depth store (one WS with every exchange).
  private resolveServices(argv: any): Array<{ name: string; id: number }> {
    const map: Record<string, number> = (config as any).tradingServices || {};
    const all = Object.entries(map).map(([name, id]) => ({
      name,
      id: Number(id),
    }));
    const fromEnv = process.env.ORDERBOOK_TRADING_SERVICES;
    if (fromEnv) {
      const wanted = fromEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return all.filter(
        (s) => wanted.includes(s.name) || wanted.includes(String(s.id)),
      );
    }
    if (argv['tradingServiceId'] != null) {
      const id = Number(argv['tradingServiceId']);
      return all.filter((s) => s.id === id);
    }
    return all;
  }

  private async initTradesProcess() {
    const argv: any = yargs.argv;
    const services = this.resolveServices(argv);
    console.log(
      `[orderbook] collecting for: ${services
        .map((s) => `${s.name}(${s.id})`)
        .join(', ')}`,
    );
    // Each exchange runs independently; one failing to connect must not stop the others.
    for (const service of services) {
      this.initExchange(service).catch((err) =>
        console.error(`[orderbook] ${service.name} init failed: ${err.message}`),
      );
    }
  }

  private async initExchange({ name, id }: { name: string; id: number }) {
    const ccxtProClass = ccxt.pro[name];
    if (!ccxtProClass) {
      console.error(`[orderbook] no ccxt.pro exchange "${name}"`);
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

    // This exchange's own pairs (pairId is unique per trading service), restricted to the
    // config `names` list so the collected set matches tr-v3-klines-client.
    const names: string[] = (config as any).names || [];
    const pairsForbidasks = await this.pairsEntityService.findMany({
      where: {
        activated: true,
        isUsedToBidasks: true,
        tradingServiceId: id,
        ...(names.length ? { name: { in: names } } : {}),
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
      `[orderbook] ${name}(${id}): watching ${watched}/${pairsForbidasks.length} pairs` +
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
        const limit = ORDERBOOK_LIMIT_BY_EXCHANGE[exchange.id];
        const data = await exchange.watchOrderBook(changedSymbol, limit);
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
