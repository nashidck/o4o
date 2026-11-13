import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Db } from "./db";
import { Security, AuthRequest } from "./security";
const change = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  version: z.number().int().positive(),
});
@Controller()
export class CampaignController {
  constructor(
    private readonly db: Db,
    private readonly security: Security,
  ) {}
  @Patch("retailer/campaigns/:campaignId") async edit(
    @Req() req: AuthRequest,
    @Param("campaignId") campaignId: string,
    @Body() body: unknown,
  ) {
    const data = change.parse(body),
      c = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException();
    const a = await this.security.retailer(req, c.retailerId);
    if (!["DRAFT", "REJECTED", "PUBLISHED", "SCHEDULED"].includes(c.status))
      throw new ConflictException("This campaign cannot currently be edited");
    return this.db.$transaction(async (tx) => {
      const result = await tx.campaign.updateMany({
        where: { id: campaignId, version: data.version },
        data: {
          version: { increment: 1 },
          ...(["DRAFT", "REJECTED"].includes(c.status)
            ? { title: data.title, description: data.description }
            : {}),
        },
      });
      if (!result.count)
        throw new ConflictException("Campaign changed. Reload before editing.");
      if (["PUBLISHED", "SCHEDULED"].includes(c.status))
        await tx.campaignRevision.create({
          data: {
            campaignId,
            version: data.version + 1,
            payload: {
              title: data.title,
              description: data.description,
              status: "SUBMITTED",
            },
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "CAMPAIGN_EDIT_SUBMITTED",
          entityType: "Campaign",
          entityId: campaignId,
        },
      });
      return { reviewRequired: ["PUBLISHED", "SCHEDULED"].includes(c.status) };
    });
  }
  @Post("admin/campaigns/:campaignId/revisions/:revisionId") async review(
    @Req() req: AuthRequest,
    @Param("campaignId") campaignId: string,
    @Param("revisionId") revisionId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req),
      data = z
        .object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          reason: z.string().max(2000).optional(),
        })
        .parse(body);
    if (data.decision === "REJECTED" && !data.reason?.trim())
      throw new BadRequestException("Provide a rejection reason");
    return this.db.$transaction(async (tx) => {
      const r = await tx.campaignRevision.findFirst({
        where: { id: revisionId, campaignId },
      });
      if (!r) throw new NotFoundException();
      const payload = z
        .object({
          title: z.string(),
          description: z.string(),
          status: z.literal("SUBMITTED"),
        })
        .safeParse(r.payload);
      if (!payload.success)
        throw new ConflictException("Revision already reviewed");
      const c = await tx.campaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      if (c.version !== r.version)
        throw new ConflictException("A newer campaign revision exists");
      const result = await tx.campaign.updateMany({
        where: { id: campaignId, version: r.version },
        data: {
          version: { increment: 1 },
          ...(data.decision === "APPROVED"
            ? {
                title: payload.data.title,
                description: payload.data.description,
              }
            : {}),
        },
      });
      if (!result.count)
        throw new ConflictException("Campaign changed during review");
      await tx.campaignRevision.update({
        where: { id: revisionId },
        data: {
          payload: {
            ...payload.data,
            status: data.decision,
            reason: data.reason || null,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: `REVISION_${data.decision}`,
          entityType: "CampaignRevision",
          entityId: revisionId,
        },
      });
      return { decision: data.decision };
    });
  }
  @Post("retailer/campaigns/:campaignId/withdraw") async withdraw(
    @Req() req: AuthRequest,
    @Param("campaignId") campaignId: string,
    @Body() body: unknown,
  ) {
    const data = z.object({ version: z.number().int().positive() }).parse(body),
      c = await this.db.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException();
    const a = await this.security.retailer(req, c.retailerId);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.campaign.updateMany({
        where: {
          id: campaignId,
          version: data.version,
          status: { not: "ARCHIVED" },
        },
        data: { status: "ARCHIVED", version: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException("Campaign changed or is already archived");
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "CAMPAIGN_WITHDRAWN",
          entityType: "Campaign",
          entityId: campaignId,
        },
      });
      return changed;
    });
  }
  @Post("retailer/:retailerId/members") async addMember(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.retailer(req, retailerId),
      data = z
        .object({ email: z.email().transform((v) => v.toLowerCase()) })
        .parse(body);
    if (!["ADMIN", "SUPER_ADMIN"].includes(a.role)) {
      const member = await this.db.retailerMember.findUnique({
        where: { retailerId_userId: { retailerId, userId: a.id } },
      });
      if (member?.role !== "OWNER")
        throw new ForbiddenException(
          "Only the business owner can manage employees",
        );
    }
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    if (!user || !user.active || !user.emailVerifiedAt)
      throw new NotFoundException(
        "Employee must have an active O4O account with a verified email",
      );
    return this.db.$transaction(async (tx) => {
      const member = await tx.retailerMember.upsert({
        where: { retailerId_userId: { retailerId, userId: user.id } },
        create: { retailerId, userId: user.id, role: "EDITOR" },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "RETAILER_EMPLOYEE_ADDED",
          entityType: "Retailer",
          entityId: retailerId,
        },
      });
      return { added: true };
    });
  }
}
