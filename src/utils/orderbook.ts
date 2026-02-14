export function getPriceOrderbook(
  orderbook: any,
  clusterSize: number,
  price: number,
) {
  const priceCluster: number = Math.ceil(price / clusterSize) * clusterSize;
  const signsAfterPoint = clusterSize.toString().split('.')?.[1]?.length || 0;
  return Number(priceCluster.toFixed(signsAfterPoint));
}

export function getDefaultOrderbookData() {
  return 0;
}
