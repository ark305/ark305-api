import { createApp } from './app';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  console.log(`ARK305 API listening at ${await app.getUrl()}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
