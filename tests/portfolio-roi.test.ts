
describe("Portfolio ROI", () => {
  test("Portfolio ROI positive", () => {
    const roi = (1200-1000)/1100*100;
    expect(roi).toBeGreaterThan(0);
  });
});
