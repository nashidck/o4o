import {
  Body,
  Controller,
  Post,
  Req,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Db } from "./db";
import { Security, AuthRequest, hash } from "./security";
import { sendMail } from "./mail";
@Controller("auth")
export class VerificationController {
  constructor(
    private readonly db: Db,
    private readonly security: Security,
  ) {}
  @Post("verification/request") async request(@Req() req: AuthRequest) {
    const a = await this.security.actor(req),
      token = randomBytes(32).toString("hex");
    const record = await this.db.recoveryToken.create({
      data: {
        tokenHash: hash(token),
        userId: a.id,
        purpose: "VERIFY_EMAIL",
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    try {
      await sendMail(
        a.email,
        "Verify your O4O email",
        `Verify your O4O email to receive private list and retailer invitations:\n${process.env.WEB_ORIGIN || "http://localhost:3000"}/verify-email?token=${token}\nThis link expires in 30 minutes. Ignore it if you did not request it.`,
      );
    } catch (error) {
      await this.db.recoveryToken.delete({ where: { id: record.id } });
      throw error;
    }
    return { message: "Verification email sent" };
  }
  @Post("verification/confirm") async confirm(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (
      req.get("origin") !== (process.env.WEB_ORIGIN || "http://localhost:3000")
    )
      throw new ForbiddenException("Invalid request origin");
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const record = await tx.recoveryToken.findUnique({
        where: { tokenHash: hash(token) },
      });
      if (
        !record ||
        record.purpose !== "VERIFY_EMAIL" ||
        record.expiresAt <= new Date()
      )
        throw new BadRequestException(
          "Verification link is invalid or expired",
        );
      const used = await tx.recoveryToken.deleteMany({
        where: { id: record.id, expiresAt: { gt: new Date() } },
      });
      if (!used.count)
        throw new BadRequestException("Verification link was already used");
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      return { verified: true };
    });
  }
}
