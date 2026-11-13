import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { Db } from "./db";
import { isManager } from "./domain";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Actor = {
  id: string;
  role: string;
  name: string;
  email: string;
  emailVerifiedAt?: Date | null;
};
export type AuthRequest = Request & { actor?: Actor };
@Injectable()
export class Security {
  constructor(private readonly db: Db) {}
  async actor(req: AuthRequest): Promise<Actor> {
    if (req.actor) return req.actor;
    const token = req.cookies?.o4o_session;
    if (!token || typeof token !== "string")
      throw new UnauthorizedException("Sign in to continue");
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new UnauthorizedException("Session expired");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrf = req.get("x-csrf-token");
      const origin = req.get("origin");
      if (origin !== (process.env.WEB_ORIGIN || "http://localhost:3000"))
        throw new ForbiddenException("Invalid request origin");
      if (
        !csrf ||
        !timingSafeEqual(Buffer.from(hash(csrf)), Buffer.from(session.csrfHash))
      )
        throw new ForbiddenException("Invalid request token");
    }
    const { id, role, name, email, emailVerifiedAt } = session.user;
    return (req.actor = { id, role, name, email, emailVerifiedAt });
  }
  async manager(req: AuthRequest) {
    const actor = await this.actor(req);
    if (!isManager(actor.role))
      throw new ForbiddenException("Administrative permission required");
    return actor;
  }
  async admin(req: AuthRequest) {
    const actor = await this.actor(req);
    if (!["ADMIN", "SUPER_ADMIN"].includes(actor.role))
      throw new ForbiddenException("Administrator permission required");
    return actor;
  }
  async retailer(req: AuthRequest, retailerId: string) {
    const actor = await this.actor(req);
    if (["ADMIN", "SUPER_ADMIN"].includes(actor.role)) return actor;
    const member = await this.db.retailerMember.findUnique({
      where: { retailerId_userId: { retailerId, userId: actor.id } },
      include: { retailer: true },
    });
    if (!member || member.retailer.status === "SUSPENDED")
      throw new ForbiddenException("Retailer access denied");
    return actor;
  }
  async createSession(userId: string, res: Response) {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 14 * 86400000);
    await this.db.session.create({
      data: { userId, tokenHash: hash(token), csrfHash: hash(csrf), expiresAt },
    });
    const options = {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: expiresAt,
    };
    res.cookie("o4o_session", token, { ...options, httpOnly: true });
    res.cookie("o4o_csrf", csrf, { ...options, httpOnly: false });
    return csrf;
  }
}
