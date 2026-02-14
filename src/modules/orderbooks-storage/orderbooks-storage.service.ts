import { Injectable } from '@nestjs/common';
import { getStartTsByTf, nowTs } from '../../utils/time';
import {
  getDefaultOrderbookData,
  getPriceOrderbook,
} from '../../utils/orderbook';
import { KLINE_TS_SIZE_BY_TF } from '../../utils/kline';

@Injectable()
export class OrderbooksStorageService {
  private readonly store = new Map<string, Record<string, any>>();

  setOrderbook(
    pairId: number,
    tf: number,
    ts: number,
    data: Record<string, any>,
  ): void {
    this.store.set(this.buildKey(pairId, tf, ts), data);
  }

  getOrderbook(
    pairId: number,
    tf: number,
    ts: number,
  ): Record<string, any> | null {
    return this.store.get(this.buildKey(pairId, tf, ts)) ?? null;
  }

  entries(): Array<[string, Record<string, any>]> {
    return Array.from(this.store.entries());
  }

  getStore(): Record<string, any> {
    return Object.fromEntries(this.store);
  }

  deleteByKey(key: string): void {
    this.store.delete(key);
  }

  deleteByOrderbook(orderbook: any): void {
    const key = this.buildKey(orderbook.pairId, orderbook.tf, orderbook.ts);
    this.store.delete(key);
  }

  finished(tf: number, ts?: number): any[] {
    ts = ts || nowTs();
    const list = Array.from(this.store.values());
    return list.filter((item: any) => {
      const endTs = parseInt(item.ts) + KLINE_TS_SIZE_BY_TF[item.tf];
      return ts > endTs && item.tf === tf;
    });
  }

  processOrderbook(
    orderbook: any,
    tf: number,
    pairId: number,
    clusterSize: any,
  ) {
    const startTs = getStartTsByTf(orderbook.timestamp, tf);
    // console.log('startTs', startTs);
    // console.log('tf', tf);
    // if no startTs in orderbooks clear this tf orderbooks and create new cluster
    // if (!this.orderbooks[pairId][tf]?.[startTs]) {
    let existOrderbook: any = this.getOrderbook(pairId, tf, startTs);

    if (!existOrderbook) {
      existOrderbook = {
        data: {},
        ts: startTs,
        pairId,
        tf,
        v: 0,
      };
    }

    for (const bid of orderbook.bids) {
      const price = getPriceOrderbook(orderbook, clusterSize, bid[0]);

      if (!existOrderbook.data[price]) {
        existOrderbook.data[price] = getDefaultOrderbookData();
      }

      const tradeVolume = bid[1];

      const priceOrderbookData: any = this.updatePriceOrderbookData(
        existOrderbook.data[price],
        tradeVolume,
      );

      existOrderbook.v += tradeVolume;
      existOrderbook.data[price] = priceOrderbookData;
    }

    for (const ask of orderbook.asks) {
      const price = getPriceOrderbook(orderbook, clusterSize, ask[0]);

      if (!existOrderbook.data[price]) {
        existOrderbook.data[price] = getDefaultOrderbookData();
      }

      const tradeVolume = ask[1];

      const priceOrderbookData: any = this.updatePriceOrderbookData(
        existOrderbook.data[price],
        tradeVolume,
      );

      existOrderbook.v += tradeVolume;
      existOrderbook.data[price] = priceOrderbookData;
    }

    this.setOrderbook(pairId, tf, startTs, existOrderbook);
  }

  private buildKey(pairId: number, tf: number, ts: number): string {
    return `${pairId}:${tf}:${ts}`;
  }

  private updatePriceOrderbookData(priceOrderbookData: any, volume: number) {
    priceOrderbookData = volume;
    return priceOrderbookData;
  }
}
