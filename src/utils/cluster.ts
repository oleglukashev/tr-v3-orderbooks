export function getPriceCluster(trade: any, clusterSize: number) {
  const priceCluster: number =
    Math.ceil(parseFloat(trade.price) / clusterSize) * clusterSize;
  const signsAfterPoint = clusterSize.toString().split('.')?.[1]?.length || 0;
  return Number(priceCluster.toFixed(signsAfterPoint));
}

export function getDefaultClusterData(priceCluster: any) {
  return {
    p: priceCluster.toString(),
    v: 0,
    bv: 0,
    sv: 0,
  };
}