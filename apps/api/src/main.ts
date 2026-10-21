import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

// The minimal part of the underlying HTTP server this file relies on.
interface HttpServer {
  set(setting: string, value: unknown): void;
  get(
    path: string,
    handler: (req: unknown, res: { redirect(url: string): void }) => void,
  ): void;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const server = app.getHttpAdapter().getInstance() as HttpServer;

  // Behind a reverse proxy (Render, Docker platforms) the client IP comes in
  // the X-Forwarded-For header. Set TRUST_PROXY to the number of proxies in
  // front of the app (1 on Render); leave it unset for local development.
  const proxyHops = Number(process.env.TRUST_PROXY ?? 0);
  if (proxyHops > 0) {
    server.set('trust proxy', proxyHops);
  }

  // Visitors who open the bare URL land on the API documentation.
  server.get('/', (_req, res) => res.redirect('/docs'));

  // Allow the future Angular frontend (override with CORS_ORIGIN="a,b").
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:4200'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LearnHub API')
    .setDescription(
      'Learning platform API: JWT authentication, role-based access control, courses and enrollments.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
  console.log(`Swagger docs on http://localhost:${port}/docs`);
}

bootstrap();