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

// watchOrderBook depth limit per exchange — exchanges only accept a fixed set of levels and throw
// otherwise (htx: 5/20/150/400; gate order_book_update: 20/50/100; okx books: 400; …). We keep the
// top ~60 levels client-side, so a moderate depth is plenty. These are ordered candidates: on a
// "level not supported" error we downgrade to the next one and retry (self-healing).
const ORDERBOOK_LIMIT_CANDIDATES: Record<string, Array<number | undefined>> = {
  bybit: [200, 50],
  okx: [400, 50, 5],
  htx: [150, 20, 5],
  gate: [100, 50, 20],
  mexc: [20, 10, 5],
  bingx: [100, 50, 20],
  kucoin: [undefined],
  bitget: [undefined],
  // htx ccxt id has been both "htx" and "huobi" across versions — cover both.
  huobi: [150, 20, 5],
};
// For exchanges not listed above, try the ccxt default first, then progressively smaller levels.
const DEFAULT_LIMIT_CANDIDATES: Array<number | undefined> = [undefined, 100, 50, 20, 5];
// A watchOrderBook error meaning "this depth level is invalid" — match the specific exchange
// phrasings (htx "accepts limits of …", gate "provided level not supported: N") without catching
// unrelated errors like rate limits.
const LEVEL_ERROR_RE =
  /accepts limits of|level not supported|provided level|not supported:\s*\d|invalid (?:depth|limit)/i;

// Gap between starting each pair's subscription, to respect per-exchange WS rate limits (mexc is
// strict: code 510 "Requests are too frequent"). Overridable per exchange.
const SUBSCRIBE_DELAY_MS_BY_EXCHANGE: Record<string, number> = {
  mexc: 500,
  bitget: 300,
  gate: 300,
};
const DEFAULT_SUBSCRIBE_DELAY_MS = 200;
// Exchanges whose USDT-perp markets live in a different ccxt class than the spot one.
// (kucoin spot markets have no "BTC/USDT:USDT" → everything gets skipped; kucoinfutures has them.)
const CCXT_FUTURES_ID: Record<string, string> = {
  kucoin: 'kucoinfutures',
};
// Rate-limit / flood errors → back off longer before reconnecting (and don't spam the bot).
const RATE_LIMIT_RE = /too frequent|too many|rate ?limit|frequently|\b429\b|\b510\b/i;

@Injectable()
export class AppService {
  // Current depth-candidate index per exchange id (advanced when a level is rejected).
  private readonly obLimitIndex = new Map<string, number>();

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
    const ccxtId = CCXT_FUTURES_ID[name] ?? name;
    const ccxtProClass = ccxt.pro[ccxtId];
    if (!ccxtProClass) {
      console.error(`[orderbook] no ccxt.pro exchange "${ccxtId}"`);
      return;
    }

    // Public market data only — no API keys. A single global key can't be valid for all 8
    // exchanges (mexc rejects it with "Api key info invalid"), and order books need no auth.
    const exchange = new ccxtProClass({
      enableRateLimit: true,
      options: {
        defaultType: 'linear', // Устанавливаем тип рынка на фьючерсный
        // Skip local order-book checksum (okx & co. throw on drift). We only need top-N depth
        // refreshed every 5s, so an occasional out-of-sync tick is fine and avoids reconnect churn.
        watchOrderBook: { checksum: false },
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

    const subscribeDelay =
      SUBSCRIBE_DELAY_MS_BY_EXCHANGE[name] ?? DEFAULT_SUBSCRIBE_DELAY_MS;
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
      // Stagger initial subscriptions so we don't trip the exchange's WS rate limit.
      await sleep(subscribeDelay);
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
    const candidates =
      ORDERBOOK_LIMIT_CANDIDATES[exchange.id] || DEFAULT_LIMIT_CANDIDATES;
    while (true) {
      // Read the (possibly downgraded) level each iteration so a rejection on one pair
      // propagates to all pairs of this exchange.
      const idx = Math.min(
        this.obLimitIndex.get(exchange.id) ?? 0,
        candidates.length - 1,
      );
      const limit = candidates[idx];
      try {
        const changedSymbol = pair.symbol.replace('USDT', '/USDT:USDT');
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
        // If the exchange rejected the depth level, downgrade to the next candidate and retry
        // (quietly — don't spam the bot for a self-healing config issue).
        if (
          LEVEL_ERROR_RE.test(error.message || '') &&
          idx < candidates.length - 1
        ) {
          this.obLimitIndex.set(exchange.id, idx + 1);
          console.warn(
            `[orderbook] ${exchange.id}: depth level ${limit} rejected, downgrading to ${candidates[idx + 1]}`,
          );
          continue;
        }
        // Rate-limit / flood → back off longer and stay quiet (transient, self-resolving).
        const rateLimited = RATE_LIMIT_RE.test(error.message || '');
        console.error('Orderbook WebSocket connection error:', error.message);
        if (rateLimited) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else {
          console.log('Reconnecting in 1 second...');
          await sentToBot(
            `orderbook microservice: ${pair.symbol} - ${error.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
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
