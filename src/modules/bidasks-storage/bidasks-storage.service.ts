import { Injectable } from '@nestjs/common';
import { getStartTsByTf, nowTs } from '../../utils/time';
import { getDefaultClusterData, getPriceCluster } from '../../utils/cluster';
import { KLINE_TS_SIZE_BY_TF } from '../../utils/kline';
import { Decimal } from 'decimal.js';

@Injectable()
export class BidasksStorageService {
  private readonly store = new Map<string, Record<string, any>>();

  setBidask(
    pairId: number,
    tf: number,
    ts: number,
    data: Record<string, any>,
  ): void {
    this.store.set(this.buildKey(pairId, tf, ts), data);
  }

  getBidask(
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

  deleteByBidask(bidask: any): void {
    const key = this.buildKey(bidask.pairId, bidask.tf, bidask.ts);
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

  processTrade(trade: any, tf: number, pairId: number, clusterSize: any) {
    const startTs = getStartTsByTf(trade.timestamp, tf);
    // console.log('startTs', startTs);
    // console.log('tf', tf);
    const priceCluster = getPriceCluster(trade, clusterSize);
    // if no startTs in clusters clear this tf clusters and create new cluster
    // if (!this.clusters[pairId][tf]?.[startTs]) {
    let cluster: any = this.getBidask(pairId, tf, startTs);

    if (!cluster) {
      cluster = {
        data: {},
        ts: startTs,
        pairId,
        tf,
        v: 0,
      };
    }

    if (!cluster.data?.[priceCluster]) {
      const pricesCluster: any[] = Object.keys(cluster.data);
      if (pricesCluster.length > 0) {
        let minPrice = pricesCluster[0];
        let maxPrice = pricesCluster[0];

        for (const price in cluster.data) {
          if (parseFloat(price) < parseFloat(minPrice)) {
            minPrice = price;
          }
          if (parseFloat(price) > parseFloat(maxPrice)) {
            maxPrice = price;
          }
        }

        let currPrice = minPrice;
        while (parseFloat(currPrice) <= parseFloat(maxPrice)) {
          if (!cluster.data?.[currPrice]) {
            cluster.data[currPrice] = getDefaultClusterData(currPrice);
          }
          currPrice = Number(new Decimal(currPrice).plus(clusterSize));
        }
      }

      if (!cluster.data[priceCluster]) {
        cluster.data[priceCluster] = getDefaultClusterData(priceCluster);
      }
    }

    const priceClusterData: any = this.updatePriceClusterData(
      cluster.data[priceCluster],
      trade,
    );

    const tradeVolume = trade.amount;
    cluster.v += parseInt(tradeVolume);
    cluster.data[priceCluster] = priceClusterData;

    this.setBidask(pairId, tf, startTs, cluster);
  }

  private buildKey(pairId: number, tf: number, ts: number): string {
    return `${pairId}:${tf}:${ts}`;
  }

  private updatePriceClusterData(priceClusterData: any, trade: any) {
    const tradeVolume = trade.amount;
    const result: any = { ...priceClusterData };
    result.v = Number(
      (parseFloat(priceClusterData.v) + parseFloat(tradeVolume)).toFixed(2),
    ).toString();
    if (trade.side === 'buy') {
      result.bv = Number(
        (parseFloat(priceClusterData.bv) + parseFloat(tradeVolume)).toFixed(2),
      ).toString();
    } else if (trade.side === 'sell') {
      result.sv = Number(
        (parseFloat(priceClusterData.sv) + parseFloat(tradeVolume)).toFixed(2),
      ).toString();
    }
    return result;
  }
}
