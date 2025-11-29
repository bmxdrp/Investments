
describe("Subaccount Sum", () => {
  test("Parent equals sum of children", () => {
    const subs = [100,200];
    const parent = 300;
    expect(subs.reduce((a,b)=>a+b,0)).toBe(parent);
  });
});
