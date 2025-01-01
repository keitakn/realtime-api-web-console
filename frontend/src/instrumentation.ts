export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // https://www.npmjs.com/package/next-logger の利用のため require を利用する
    // eslint-disable-next-line ts/no-require-imports
    await require('pino');
    // eslint-disable-next-line ts/no-require-imports
    await require('next-logger');
  }
}
