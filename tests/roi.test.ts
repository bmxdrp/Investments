function calculateROI(initial: number, current: number) {
const gain = current - initial;
const avg = (initial + current) / 2;
return avg > 0 ? (gain / avg) * 100 : 0;
}


describe('ROI', () => {
test('capital creciendo → ROI positivo', () => {
const roi = calculateROI(100, 150);
expect(roi).toBeGreaterThan(0);
});


test('capital bajando → ROI negativo', () => {
const roi = calculateROI(150, 100);
expect(roi).toBeLessThan(0);
});


test('promedio cero → ROI seguro = 0', () => {
const roi = calculateROI(0, 0);
expect(roi).toBe(0);
});
});