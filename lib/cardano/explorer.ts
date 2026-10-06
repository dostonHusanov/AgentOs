export function explorerUrl(hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Invalid transaction hash");
  return `https://preprod.cardanoscan.io/transaction/${hash}`;
}
