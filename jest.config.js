/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
preset: 'ts-jest',
testEnvironment: 'node',
roots: ['<rootDir>/tests'],
moduleFileExtensions: ['ts', 'js'],
moduleNameMapper: {
'^@lib/(.*)$': '<rootDir>/src/lib/$1',
},
};