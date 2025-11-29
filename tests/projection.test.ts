const calculateProjection = (values: number[], days: number) => {
  if (values.length < 2) return values[values.length - 1] || 0;

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = values;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return values[values.length - 1];
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return slope * (n + days) + intercept;
};


describe('calculateProjection', () => {
test('proyección de serie creciente → valor superior', () => {
const p = calculateProjection([100, 110, 120], 90);
expect(p).toBeGreaterThan(120);
});


test('serie plana → proyección estable', () => {
const p = calculateProjection([100, 100, 100], 90);
expect(p).toBeCloseTo(100, 2);
});


test('serie de un solo valor → retorna mismo valor', () => {
const p = calculateProjection([100], 90);
expect(p).toBe(100);
});
});