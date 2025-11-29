const calculateMetrics = (values: number[]) => {
  if (values.length < 2)
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };

  const returns = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
  }

  if (returns.length === 0)
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const riskFreeRate = 0.05 / 252;
  const excessReturns = returns.map((r) => r - riskFreeRate);
  const avgExcessReturn =
    excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const sharpe =
    volatility > 0 ? (avgExcessReturn * 252) / (volatility / 100) : 0;

  let maxDrawdown = 0;
  let peak = values[0];
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = ((value - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return { volatility, sharpe, maxDrawdown, avgReturn: avgReturn * 252 * 100 };
};


describe('calculateMetrics', () => {
test('serie constante → volatilidad = 0', () => {
const result = calculateMetrics([100, 100, 100]);
expect(result.volatility).toBe(0);
});


test('serie creciente → retorno positivo', () => {
const result = calculateMetrics([100, 110, 130]);
expect(result.avgReturn).toBeGreaterThan(0);
});


test('serie con un solo punto → métricas en cero', () => {
const result = calculateMetrics([100]);
expect(result.volatility).toBe(0);
expect(result.sharpe).toBe(0);
});
});