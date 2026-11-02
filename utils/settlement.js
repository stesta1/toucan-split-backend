// Dado un balance neto por persona (positivo = le deben, negativo = debe),
// arma la lista mínima de transferencias que salda todo. Greedy: el mayor
// acreedor cobra del mayor deudor hasta que alguno llega a cero.
export function matchDebts(balance) {
  const creditors = [];
  const debtors = [];
  for (const [id, net] of Object.entries(balance)) {
    if (net > 0.001) creditors.push({ id, amount: net });
    if (net < -0.001) debtors.push({ id, amount: -net });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    result.push({ from: debtor.id, to: creditor.id, amount: Math.round(amount * 100) / 100 });

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount < 0.001) ci++;
    if (debtor.amount < 0.001) di++;
  }

  return result;
}
