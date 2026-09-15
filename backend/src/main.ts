import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle("IT Asset & AD Automation Platform")
    .setDescription(
      "Inventory, Active Directory sync, File Server provisioning, and Onboarding automation API",
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