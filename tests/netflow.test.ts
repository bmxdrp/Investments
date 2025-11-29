
describe("Net Flow", () => {
  test("Net flow = contributions - withdrawals", () => {
    const contrib = 100;
    const withdraw = 40;
    expect(contrib - withdraw).toBe(60);
  });
});
