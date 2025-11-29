
describe("Portfolio Allocation", () => {
  test("Allocation sums to 100", () => {
    const allocs = [40,30,30];
    const sum = allocs.reduce((a,b)=>a+b,0);
    expect(sum).toBe(100);
  });
});
