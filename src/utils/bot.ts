export default async function sentToBot(text: string) {
  return fetch('http://traken-trade.ru/bot/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `klines microservice: ${text}`,
    }),
  });
}
