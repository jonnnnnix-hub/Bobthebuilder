import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableCors({ origin: '*' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger setup
  const swaggerPath = 'api-docs';

  // Prevent caching of swagger docs
  app.use(
    `/${swaggerPath}`,
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      next();
    },
  );

  const config = new DocumentBuilder()
    .setTitle('Bob - Options Volatility Signal Generator')
    .setDescription(
      'Phase 1: Signal generation system for options volatility trading. ' +
        'Computes ATM IV, Historical Volatility, VRP, and IV z-scores across a universe of liquid stocks/ETFs using real observed history only. ' +
        'Identifies top candidates based on cross-sectional ranking with VRP >= 95th percentile and IV z-score >= 92.5th percentile thresholds.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document, {
    customSiteTitle: 'Bob - Volatility Signal API',
    customfavIcon: 'https://cdn-icons-png.flaticon.com/512/2920/2920349.png',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info { margin: 30px 0; }
      .swagger-ui .info .title { font-size: 2em; color: #1a1a2e; font-weight: 700; }
      .swagger-ui .info .description p { font-size: 1.05em; color: #4a4a6a; line-height: 1.6; }
      .swagger-ui .opblock-tag { font-size: 1.1em; font-weight: 600; color: #2d2d44; border-bottom: 2px solid #e8e8f0; }
      .swagger-ui .opblock .opblock-summary-method { font-weight: 700; border-radius: 4px; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #2563eb; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #16a34a; }
      .swagger-ui .opblock { border-radius: 8px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      .swagger-ui .btn.execute { background: #2563eb; border-color: #2563eb; border-radius: 6px; }
      .swagger-ui section.models { border-radius: 8px; }
      body { background: #f8f9fc; }
      .swagger-ui .wrapper { max-width: 1200px; }
    `,
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(
    `Bob Signal Generator running on http://${host}:${port}`,
    'Bootstrap',
  );
  Logger.log(
    `API Documentation: http://${host}:${port}/${swaggerPath}`,
    'Bootstrap',
  );
}
bootstrap();
