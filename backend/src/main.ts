import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import express from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN || true,
    credentials: true,
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle("IT Asset Management Platform")
    .setDescription(
      "Inventory, email-verified account registration, and branch-based ticketing API",
    )
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 3000;
  
  // 🔴 التعديل هنا: إضافة '0.0.0.0' لتسمح بالربط من الـ IP الشبكي (10.22.28.82)
  await app.listen(port, '0.0.0.0');
  
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port} — docs at /api/docs`);
}
bootstrap();