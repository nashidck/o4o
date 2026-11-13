import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Module,
} from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { json } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { Db } from "./db";
import { Security } from "./security";
import { AppController } from "./routes";
import { UploadController } from "./uploads";
import { ManagementController } from "./management";
import { SearchController } from "./search";
import { RecoveryController } from "./recovery";
import { CampaignController } from "./campaigns";
import { VerificationController } from "./verification";

@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      response = ctx.getResponse(),
      request = ctx.getRequest();
    let status = 500,
      message = "The service could not complete this request";
    if (error instanceof ZodError) {
      status = 400;
      message = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      status = 409;
      message = "This record already exists";
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      status = 404;
      message = "Record not found";
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      status = 400;
      message = "A referenced record is invalid or still in use";
    }
    const requestId = randomUUID();
    console.error(
      JSON.stringify({
        requestId,
        status,
        method: request.method,
        path: request.path,
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    response.status(status).json({ error: { message, requestId } });
  }
}
@Module({
  controllers: [
    AppController,
    UploadController,
    ManagementController,
    SearchController,
    RecoveryController,
    CampaignController,
    VerificationController,
  ],
  providers: [Db, Security],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api/v1");
  app.use(helmet(), cookieParser(), json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN || "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  });
  app.useGlobalFilters(new Errors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("O4O API")
      .setDescription(
        "Regional retail discovery API. Mutations require a session and CSRF token.",
      )
      .setVersion("1.0")
      .addCookieAuth("o4o_session")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT || 4000), "0.0.0.0");
}
bootstrap();
