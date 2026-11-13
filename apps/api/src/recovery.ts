import {
  Body,
  Controller,
  Post,
  Req,
  ForbiddenException,
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import * as argon2 from "argon2";
import nodemailer from "nodemailer";
import { Db } from "./db";
import { hash, AuthRequest } from "./security";
@Controller("auth")
export class RecoveryController {
  constructor(private readonly db: Db) {}
  @Post("recover") async recover(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (
      req.get("origin") !== (process.env.WEB_ORIGIN || "http://localhost:3000")
    )
      throw new ForbiddenException("Invalid request origin");
    const data = z
      .object({ email: z.email().transform((v) => v.toLowerCase()) })
      .parse(body);
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
      throw new ServiceUnavailableException(
        "Email recovery is currently unavailable. Contact the O4O operator.",
      );
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    if (user && user.active) {
      const token = randomBytes(32).toString("hex");
      await this.db.recoveryToken.deleteMany({ where: { userId: user.id } });
      await this.db.recoveryToken.create({
        data: {
          tokenHash: hash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        ...(process.env.SMTP_USER
          ? {
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
            }
          : {}),
      });
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: user.email,
          subject: "Reset your O4O password",
          text: `You requested an O4O password reset. This link expires in 30 minutes:\n${process.env.WEB_ORIGIN || "http://localhost:3000"}/recover?token=${token}\nIf you did not request this, ignore this email.`,
        });
      } catch {
        await this.db.recoveryToken.deleteMany({
          where: { tokenHash: hash(token) },
        });
        throw new ServiceUnavailableException(
          "Email delivery is temporarily unavailable",
        );
      }
    }
    return {
      message: "If an active account exists, a recovery link has been sent.",
    };
  }
  @Post("reset") async reset(@Req() req: AuthRequest, @Body() body: unknown) {
    if (
      req.get("origin") !== (process.env.WEB_ORIGIN || "http://localhost:3000")
    )
      throw new ForbiddenException("Invalid request origin");
    const data = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(12).max(128),
      })
      .parse(body);
    const token = await this.db.recoveryToken.findUnique({
      where: { tokenHash: hash(data.token) },
    });
    if (!token || token.purpose !== "RECOVERY" || token.expiresAt <= new Date())
      throw new BadRequestException("This recovery link is invalid or expired");
    const passwordHash = await argon2.hash(data.password);
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.recoveryToken.deleteMany({
        where: { id: token.id, expiresAt: { gt: new Date() } },
      });
      if (!consumed.count)
        throw new BadRequestException(
          "This recovery link has already been used",
        );
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await tx.auditLog.create({
        data: {
          actorId: token.userId,
          action: "PASSWORD_RECOVERED",
          entityType: "User",
          entityId: token.userId,
        },
      });
    });
    return { message: "Password reset. Sign in with your new password." };
  }
}
