import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SafeExceptionFilter } from './http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = new Set(['http://localhost:3001', ...(process.env.FRONTEND_URL ?? '').split(',')]
    .map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean));
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => callback(null, !origin || origins.has(origin)),
    methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'],
  });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4001), '0.0.0.0');
}
bootstrap().catch(() => { console.error('서버를 시작하지 못했습니다. 실행 설정을 확인해 주세요.'); process.exitCode = 1; });
