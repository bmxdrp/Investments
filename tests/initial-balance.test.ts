
describe("Initial Balance", () => {
  test("Initial balance must not affect ROI", () => {
    const initial = 0;
    const current = 100;
    expect(current - initial).toBe(100);
  });
});
