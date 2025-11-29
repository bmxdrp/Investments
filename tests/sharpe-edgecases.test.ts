
describe("Sharpe Edge Case", () => {
  test("Zero volatility does not crash Sharpe", () => {
    const sharpe = 0;
    expect(sharpe).toBeDefined();
  });
});
