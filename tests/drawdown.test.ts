
describe("Drawdown", () => {
  test("Drawdown never positive", () => {
    const peak = 200;
    const value = 150;
    const dd = ((value-peak)/peak)*100;
    expect(dd).toBeLessThanOrEqual(0);
  });
});
