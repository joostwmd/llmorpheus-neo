module.exports = {
  verbose: true,
  injectGlobals: false,
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/**/*.ts'
  ],
  transform: {
    '.(ts|tsx)': require.resolve('ts-jest')
  }
}
