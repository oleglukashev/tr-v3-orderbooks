import { Injectable } from '@nestjs/common';
import moment from 'moment';
import {
  delta,
  direction,
  pocFromCluster,
  sortedClusterData,
} from '../../utils/kline';
import { FppEntityService } from '../entity-services/fpp-entity-service';
import { BidasksStorageService } from '../bidasks-storage/bidasks-storage.service';
import { ClustersEntityService } from '../entity-services/clusters-entity-service';

@Injectable()
export class GenerateFppService {
  constructor(
    private readonly clustersEntityService: ClustersEntityService,
    private readonly fppEntityService: FppEntityService,
    private readonly bidasksStorageService: BidasksStorageService,
  ) {}

  async processFpp(pairId: number, tf: number) {
    const cluster2Ts = moment()
      .utc()
      .startOf('minute')
      .subtract(tf, 'minute')
      .valueOf();
    const cluster1Ts = moment()
      .utc()
      .startOf('minute')
      .subtract(2 * tf, 'minute')
      .valueOf();

    let cluster2 = await this.clustersEntityService.findFirst({
      where: {
        pairId: { equals: pairId },
        tf: { equals: tf },
        ts: { equals: cluster2Ts },
      },
    });

    if (!cluster2) {
      cluster2 = this.bidasksStorageService.getBidask(pairId, tf, cluster2Ts);
    }

    let cluster1 = await this.clustersEntityService.findFirst({
      where: {
        pairId: { equals: pairId },
        tf: { equals: tf },
        ts: { equals: cluster1Ts },
      },
    });

    if (!cluster1) {
      cluster1 = this.bidasksStorageService.getBidask(pairId, tf, cluster1Ts);
    }

    // const cluster2 = await this.clustersEntityService.findFirst({
    //   where: {
    //     ts: { equals: getStartTsByTf(cluster2Ts, tf) },
    //     pairId: { equals: pairId },
    //     tf: { equals: tf },
    //   },
    // });
    //
    // const cluster1 = await this.clustersEntityService.findFirst({
    //   where: {
    //     ts: { equals: getStartTsByTf(cluster1Ts, tf) },
    //     pairId: { equals: pairId },
    //     tf: { equals: tf },
    //   },
    // });

    if (!cluster1 || !cluster2) {
      return;
    }

    const kline1Res = await fetch(this.getKlinePath(pairId, cluster1.ts, tf));
    const kline2Res = await fetch(this.getKlinePath(pairId, cluster2.ts, tf));
    const kline1 = await kline1Res.json();
    const kline2 = await kline2Res.json();
    // Interception pattern
    try {
      await this.processInterceptionPattern(
        cluster1,
        cluster2,
        kline1,
        kline2,
        pairId,
        tf,
      );
    } catch (error) {
      console.log(`Interception pattern error: ${error}`);
    }
    // Reverse pattern
    try {
      await this.processReversePattern(
        cluster1,
        cluster2,
        kline1,
        kline2,
        pairId,
        tf,
      );
    } catch (error) {
      console.log(`Reverse pattern error: ${error}`);
    }
    // Test volume pattern
    try {
      await this.processTestVolumePattern(cluster1, kline1, kline2, pairId, tf);
    } catch (error) {
      console.log(`Test volume pattern error: ${error}`);
    }
    // Locked volume
    try {
      await this.processLockedVolumePattern(cluster2, kline2, pairId, tf);
    } catch (error) {
      console.log(`Locked volume pattern error: ${error}`);
    }
    // Locked delta
    try {
      await this.processLockedDeltaPattern(cluster2, kline2, pairId, tf);
    } catch (error) {
      console.log(`Locked delta pattern error: ${error}`);
    }
    // Locked imbalance
    try {
      await this.processLockedImbalancePattern(cluster2, kline2, pairId, tf);
    } catch (error) {
      console.log(`Locked imbalance pattern error: ${error}`);
    }
    // Process low last price volume
    try {
      await this.processLowLastPriceVolumePattern(cluster2, kline2, pairId, tf);
    } catch (error) {
      console.log(`Process low last price volume pattern error: ${error}`);
    }
    // Process resistance
    try {
      await this.processResistancePattern(kline1, kline2, pairId, tf);
    } catch (error) {
      console.log(`Process resistance pattern error: ${error}`);
    }
    // Process weakness
    try {
      await this.processWeaknessPattern(cluster2, kline2, pairId, tf);
    } catch (error) {
      console.log(`Process weakness pattern error: ${error}`);
    }
  }

  private async processInterceptionPattern(
    cluster1: any,
    cluster2: any,
    kline1: any,
    kline2: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline1 || !kline2) {
      console.log(`${pairId},${tf}: Not enough klines data`);
    }

    const cluster1Poc: any = pocFromCluster(cluster1);
    const cluster2Poc: any = pocFromCluster(cluster2);

    if (!cluster1Poc || !cluster2Poc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const kline1Direction = direction(kline1);
    const kline2Direction = direction(kline2);

    if (kline1Direction !== kline2Direction) {
      if (kline1Direction === 'up') {
        // down reverse
        if (
          parseFloat(cluster1Poc.p) > parseFloat(kline1.close) &&
          parseFloat(cluster2Poc.p) > parseFloat(kline2.close)
        ) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'down',
            type: 'interception',
          });
        }
      } else {
        // up reverse
        if (
          parseFloat(cluster1Poc.p) < parseFloat(kline1.close) &&
          parseFloat(cluster2Poc.p) < parseFloat(kline2.close)
        ) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'up',
            type: 'interception',
          });
        }
      }
    }
  }

  private async processReversePattern(
    cluster1: any,
    cluster2: any,
    kline1: any,
    kline2: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline1 || !kline2) {
      console.log(`${pairId},${tf}: Not enough klines data`);
    }

    const cluster1Poc: any = pocFromCluster(cluster1);
    const cluster2Poc: any = pocFromCluster(cluster2);

    if (!cluster1Poc || !cluster2Poc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const kline1Direction = direction(kline1);
    const kline2Direction = direction(kline2);

    if (kline1Direction !== kline2Direction) {
      if (kline1Direction === 'up') {
        // down reverse
        if (parseFloat(cluster1Poc.p) > parseFloat(cluster2Poc.p)) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'down',
            type: 'reverse',
          });
        }
      } else {
        // up reverse
        if (parseFloat(cluster2Poc.p) > parseFloat(cluster1Poc.p)) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'up',
            type: 'reverse',
          });
        }
      }
    }
  }

  private async processLockedVolumePattern(
    cluster: any,
    kline: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline) {
      console.log(`${pairId},${tf}: Not enough kline data`);
    }

    const clusterPoc: any = pocFromCluster(cluster);

    if (!clusterPoc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const klineDirection = direction(kline);

    if (klineDirection === 'down') {
      // down reverse
      if (parseFloat(clusterPoc.p) > parseFloat(kline.open)) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'down',
          type: 'locked_volume',
        });
      }
    } else {
      // up reverse
      if (parseFloat(clusterPoc.p) < parseFloat(kline.open)) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'up',
          type: 'locked_volume',
        });
      }
    }
  }

  private async processLockedDeltaPattern(
    cluster: any,
    kline: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline) {
      console.log(`${pairId},${tf}: Not enough kline data`);
    }

    const clusterPoc: any = pocFromCluster(cluster);

    if (!clusterPoc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const klineDirection = direction(kline);

    if (klineDirection === 'down') {
      // down reverse
      const sortedData = sortedClusterData(cluster, false);
      const firstClusterPriceDelta = sortedData[0]
        ? parseFloat(delta(sortedData[0]))
        : null;
      const secondClusterPriceDelta = sortedData[1]
        ? parseFloat(delta(sortedData[1]))
        : null;
      const thirdClusterPriceDelta = sortedData[2]
        ? parseFloat(delta(sortedData[2]))
        : null;
      if (
        firstClusterPriceDelta &&
        firstClusterPriceDelta > 0 &&
        secondClusterPriceDelta &&
        secondClusterPriceDelta > 0 &&
        thirdClusterPriceDelta &&
        thirdClusterPriceDelta > 0 &&
        parseFloat(sortedData[2].p) > parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'down',
          type: 'locked_delta',
        });
      }
    } else {
      // up reverse
      const sortedData = sortedClusterData(cluster, true);
      const firstClusterPriceDelta = sortedData[0]
        ? parseFloat(delta(sortedData[0]))
        : null;
      const secondClusterPriceDelta = sortedData[1]
        ? parseFloat(delta(sortedData[1]))
        : null;
      const thirdClusterPriceDelta = sortedData[2]
        ? parseFloat(delta(sortedData[2]))
        : null;
      if (
        firstClusterPriceDelta &&
        firstClusterPriceDelta > 0 &&
        secondClusterPriceDelta &&
        secondClusterPriceDelta > 0 &&
        thirdClusterPriceDelta &&
        thirdClusterPriceDelta > 0 &&
        parseFloat(sortedData[2].p) < parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'up',
          type: 'locked_delta',
        });
      }
    }
  }

  private async processLockedImbalancePattern(
    cluster: any,
    kline: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline) {
      console.log(`${pairId},${tf}: Not enough kline data`);
    }

    const clusterPoc: any = pocFromCluster(cluster);

    if (!clusterPoc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const klineDirection = direction(kline);

    if (klineDirection === 'down') {
      // down reverse
      const sortedData = sortedClusterData(cluster, false);
      const firstClusterPriceDelta = sortedData[0]
        ? parseFloat(delta(sortedData[0]))
        : null;
      const firstClusterPriceBuy = sortedData[0]
        ? parseFloat(sortedData[0].bv)
        : null;
      const secondClusterPriceDelta = sortedData[1]
        ? parseFloat(delta(sortedData[1]))
        : null;
      const secondClusterPriceBuy = sortedData[1]
        ? parseFloat(sortedData[1].bv)
        : null;
      const thirdClusterPriceDelta = sortedData[2]
        ? parseFloat(delta(sortedData[2]))
        : null;
      const thirdClusterPriceBuy = sortedData[2]
        ? parseFloat(sortedData[2].bv)
        : null;
      if (
        firstClusterPriceDelta &&
        firstClusterPriceDelta > 0 &&
        firstClusterPriceBuy === 0 &&
        secondClusterPriceDelta &&
        secondClusterPriceDelta > 0 &&
        secondClusterPriceBuy === 0 &&
        thirdClusterPriceDelta &&
        thirdClusterPriceDelta > 0 &&
        thirdClusterPriceBuy === 0 &&
        parseFloat(sortedData[2].p) > parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'down',
          type: 'locked_imbalance',
        });
      }
    } else {
      // up reverse
      const sortedData = sortedClusterData(cluster, true);
      const firstClusterPriceDelta = sortedData[0]
        ? parseFloat(delta(sortedData[0]))
        : null;
      const firstClusterPriceSell = sortedData[0]
        ? parseFloat(sortedData[0].sv)
        : null;
      const secondClusterPriceDelta = sortedData[1]
        ? parseFloat(delta(sortedData[1]))
        : null;
      const secondClusterPriceSell = sortedData[1]
        ? parseFloat(sortedData[1].sv)
        : null;
      const thirdClusterPriceDelta = sortedData[2]
        ? parseFloat(delta(sortedData[2]))
        : null;
      const thirdClusterPriceSell = sortedData[2]
        ? parseFloat(sortedData[2].sv)
        : null;
      if (
        firstClusterPriceDelta &&
        firstClusterPriceDelta > 0 &&
        firstClusterPriceSell === 0 &&
        secondClusterPriceDelta &&
        secondClusterPriceDelta > 0 &&
        secondClusterPriceSell === 0 &&
        thirdClusterPriceDelta &&
        thirdClusterPriceDelta > 0 &&
        thirdClusterPriceSell === 0 &&
        parseFloat(sortedData[2].p) < parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: 'up',
          type: 'locked_imbalance',
        });
      }
    }
  }

  private async processLowLastPriceVolumePattern(
    cluster: any,
    kline: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline) {
      console.log(`${pairId},${tf}: Not enough kline data`);
    }

    const clusterPoc: any = pocFromCluster(cluster);

    if (!clusterPoc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const klineDirection = direction(kline);

    let sortedData = null;
    if (klineDirection === 'down') {
      // down reverse
      sortedData = sortedClusterData(cluster, false);
    } else {
      // up reverse
      sortedData = sortedClusterData(cluster, true);
    }

    const firstClusterPrice: any = parseFloat(sortedData[0].v);

    if (parseFloat(clusterPoc.v) > 100 * firstClusterPrice) {
      await this.fppEntityService.baseCreate({
        ts: kline.ts,
        pairId,
        tf,
        direction: klineDirection,
        type: 'low_last_price_volume',
      });
    }
  }

  private async processWeaknessPattern(
    cluster: any,
    kline: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline) {
      console.log(`${pairId},${tf}: Not enough kline data`);
    }

    const clusterPoc: any = pocFromCluster(cluster);

    if (!clusterPoc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    const klineDirection = direction(kline);
    const topWickSize =
      parseFloat(kline.high) -
      (klineDirection === 'up'
        ? parseFloat(kline.close)
        : parseFloat(kline.open));
    const bottomWickSize =
      (klineDirection === 'up'
        ? parseFloat(kline.open)
        : parseFloat(kline.close)) - parseFloat(kline.low);
    const bodyWickSize =
      klineDirection === 'up'
        ? parseFloat(kline.close) - parseFloat(kline.open)
        : parseFloat(kline.open) - parseFloat(kline.close);
    const weaknessEnoughCondition =
      topWickSize / bottomWickSize > 4 || bottomWickSize / topWickSize > 4;
    const bodySizeEnoughCondition =
      (topWickSize + bottomWickSize) / bodyWickSize > 6;

    if (klineDirection === 'down') {
      // down
      if (
        weaknessEnoughCondition &&
        bodySizeEnoughCondition &&
        parseFloat(clusterPoc.p) > parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: klineDirection,
          type: 'weakness',
        });
      }
    } else {
      // up
      if (
        weaknessEnoughCondition &&
        bodySizeEnoughCondition &&
        parseFloat(clusterPoc.p) < parseFloat(kline.open)
      ) {
        await this.fppEntityService.baseCreate({
          ts: kline.ts,
          pairId,
          tf,
          direction: klineDirection,
          type: 'weakness',
        });
      }
    }
  }

  private async processTestVolumePattern(
    cluster1: any,
    kline1: any,
    kline2: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline1 || !kline2) {
      console.log(`${pairId},${tf}: Not enough klines data`);
    }

    const cluster1Poc: any = pocFromCluster(cluster1);

    if (!cluster1Poc) {
      console.log(`${pairId},${tf}: Not enough poc data`);
    }

    // down reverse
    if (
      parseFloat(cluster1Poc.p) > parseFloat(kline2.close) &&
      parseFloat(cluster1Poc.p) > parseFloat(kline2.open) &&
      parseFloat(cluster1Poc.p) < parseFloat(kline2.high)
    ) {
      await this.fppEntityService.baseCreate({
        ts: kline2.ts,
        pairId,
        tf,
        direction: 'down',
        type: 'test_volume',
      });
      // up reverse
    } else if (
      parseFloat(cluster1Poc.p) < parseFloat(kline2.close) &&
      parseFloat(cluster1Poc.p) < parseFloat(kline2.open) &&
      parseFloat(cluster1Poc.p) > parseFloat(kline2.low)
    ) {
      await this.fppEntityService.baseCreate({
        ts: kline2.ts,
        pairId,
        tf,
        direction: 'up',
        type: 'test_volume',
      });
    }
  }

  private async processResistancePattern(
    kline1: any,
    kline2: any,
    pairId: number,
    tf: number,
  ) {
    if (!kline1 || !kline2) {
      console.log(`${pairId},${tf}: Not enough klines data`);
    }

    const kline1Direction = direction(kline1);
    const kline2Direction = direction(kline2);

    if (kline1Direction !== kline2Direction) {
      if (kline1Direction === 'up') {
        // down reverse
        if (parseFloat(kline1.open) > parseFloat(kline2.close)) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'down',
            type: 'resistance',
          });
        }
      } else {
        // up reverse
        if (parseFloat(kline1.open) < parseFloat(kline2.close)) {
          await this.fppEntityService.baseCreate({
            ts: kline2.ts,
            pairId,
            tf,
            direction: 'up',
            type: 'resistance',
          });
        }
      }
    }
  }

  private getKlinePath(pairId: number, ts: number, tf: number) {
    return `http://klines.traken-trade.ru/api/v1/klines/by_pair_id_and_tf_and_ts?pairId=${pairId}&ts=${ts}&tf=${tf}`;
  }
}
