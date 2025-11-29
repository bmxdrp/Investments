function toCOP(value: number, currency: string, rate = 4000) {
return currency === 'USD' ? value * rate : value;
}


describe('Conversión de moneda', () => {
test('USD → COP correctamente', () => {
const cop = toCOP(1, 'USD', 4000);
expect(cop).toBe(4000);
});


test('COP → COP sin cambios', () => {
const cop = toCOP(5000, 'COP', 4000);
expect(cop).toBe(5000);
});
});