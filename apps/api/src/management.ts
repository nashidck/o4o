import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Query,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { Db } from "./db";
import { Security, AuthRequest } from "./security";
const id = z.string().min(1).max(100),
  text = z.string().trim().min(1).max(200);
const coupon = z.object({
  retailerId: id,
  title: text,
  code: z.string().max(100).optional(),
  description: z.string().max(3000),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().positive(),
  minimumPurchase: z.number().nonnegative().optional(),
  maximumDiscount: z.number().positive().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  instructions: z.string().min(1).max(3000),
  terms: z.string().min(1).max(5000),
  regionIds: z.array(id).max(100),
  branchIds: z.array(id).max(1000).default([]),
  active: z.boolean().default(false),
});
@Controller()
export class ManagementController {
  constructor(
    private readonly db: Db,
    private readonly security: Security,
  ) {}
  @Get("admin/categories") async categories(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.category.findMany({ orderBy: { position: "asc" } });
  }
  @Patch("admin/categories/:categoryId") async category(
    @Req() req: AuthRequest,
    @Param("categoryId") categoryId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req);
    const data = z
      .object({
        name: text.optional(),
        nameMl: text.optional(),
        position: z.number().int().optional(),
        active: z.boolean().optional(),
        parentId: id.nullable().optional(),
      })
      .parse(body);
    if (data.parentId) {
      let next: string | null = data.parentId;
      for (let depth = 0; next && depth < 30; depth++) {
        if (next === categoryId)
          throw new BadRequestException(
            "Category hierarchy cannot contain a cycle",
          );
        const p: { parentId: string | null } | null =
          await this.db.category.findUnique({
            where: { id: next },
            select: { parentId: true },
          });
        if (!p) throw new BadRequestException("Parent category not found");
        next = p.parentId;
      }
    }
    return this.db.$transaction(async (tx) => {
      const c = await tx.category.update({ where: { id: categoryId }, data });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "CATEGORY_UPDATED",
          entityType: "Category",
          entityId: categoryId,
        },
      });
      return c;
    });
  }
  @Get("admin/locations") async locations(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.location.findMany({
      include: { parent: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    });
  }
  @Patch("admin/locations/:locationId") async location(
    @Req() req: AuthRequest,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          name: text.optional(),
          nameMl: text.optional(),
          active: z.boolean().optional(),
        })
        .parse(body);
    return this.db.$transaction(async (tx) => {
      const l = await tx.location.update({ where: { id: locationId }, data });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "LOCATION_UPDATED",
          entityType: "Location",
          entityId: locationId,
        },
      });
      return l;
    });
  }
  @Get("admin/branches") async branches(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.branch.findMany({
      include: { retailer: { select: { name: true } }, location: true },
      take: 100,
    });
  }
  @Patch("retailer/:retailerId/branches/:branchId") async branch(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
    @Param("branchId") branchId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.retailer(req, retailerId),
      data = z
        .object({
          name: text.optional(),
          address: z.string().max(1000).optional(),
          phone: z.string().max(30).optional(),
          active: z.boolean().optional(),
          openingHours: z.record(z.string(), z.string().max(100)).optional(),
          latitude: z.number().min(-90).max(90).optional(),
          longitude: z.number().min(-180).max(180).optional(),
        })
        .parse(body);
    return this.db.$transaction(async (tx) => {
      const b = await tx.branch.updateMany({
        where: { id: branchId, retailerId },
        data,
      });
      if (!b.count) throw new NotFoundException();
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "BRANCH_UPDATED",
          entityType: "Branch",
          entityId: branchId,
        },
      });
      return b;
    });
  }
  @Get("admin/coupons") async coupons(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.coupon.findMany({
      include: {
        retailer: { select: { name: true } },
        regions: true,
        branches: true,
      },
      take: 100,
    });
  }
  @Post("admin/coupons") async createCoupon(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req),
      data = coupon.parse(body);
    if (
      data.endsAt <= data.startsAt ||
      (!data.regionIds.length && !data.branchIds.length) ||
      (data.discountType === "PERCENT" && data.discountValue > 100)
    )
      throw new BadRequestException("Check validity, scope and discount value");
    if (
      (await this.db.branch.count({
        where: { id: { in: data.branchIds }, retailerId: data.retailerId },
      })) !== new Set(data.branchIds).size
    )
      throw new BadRequestException("Coupon contains invalid branches");
    const { regionIds, branchIds, ...fields } = data;
    return this.db.$transaction(async (tx) => {
      const c = await tx.coupon.create({
        data: {
          ...fields,
          regions: { create: regionIds.map((locationId) => ({ locationId })) },
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "COUPON_CREATED",
          entityType: "Coupon",
          entityId: c.id,
        },
      });
      return c;
    });
  }
  @Patch("admin/coupons/:couponId") async toggleCoupon(
    @Req() req: AuthRequest,
    @Param("couponId") couponId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req),
      data = z.object({ active: z.boolean() }).parse(body);
    return this.db.$transaction(async (tx) => {
      const c = await tx.coupon.update({ where: { id: couponId }, data });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "COUPON_STATUS_UPDATED",
          entityType: "Coupon",
          entityId: couponId,
        },
      });
      return c;
    });
  }
  @Get("admin/advertisements") async ads(@Req() req: AuthRequest) {
    await this.security.admin(req);
    return this.db.advertisement.findMany({
      take: 100,
      orderBy: { startsAt: "desc" },
    });
  }
  @Post("admin/advertisements") async createAd(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          advertiser: text,
          title: text,
          creativeUrl: z.url().refine((v) => v.startsWith("https://")),
          targetUrl: z.url().refine((v) => v.startsWith("https://")),
          placement: z.enum([
            "HOME_RETAILER",
            "HOME_BANNER",
            "PRODUCT",
            "CATEGORY",
            "DISTRICT",
            "SEARCH",
            "CATALOGUE",
          ]),
          regionIds: z.array(id).min(1).max(100),
          budget: z.number().nonnegative().optional(),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          active: z.boolean().default(false),
        })
        .parse(body);
    if (data.endsAt <= data.startsAt)
      throw new BadRequestException("Invalid advertisement dates");
    if (
      (await this.db.location.count({
        where: { id: { in: data.regionIds }, active: true },
      })) !== new Set(data.regionIds).size
    )
      throw new BadRequestException("Invalid target regions");
    return this.db.$transaction(async (tx) => {
      const ad = await tx.advertisement.create({ data });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "ADVERTISEMENT_CREATED",
          entityType: "Advertisement",
          entityId: ad.id,
        },
      });
      return ad;
    });
  }
  @Patch("admin/advertisements/:adId") async toggleAd(
    @Req() req: AuthRequest,
    @Param("adId") adId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z.object({ active: z.boolean() }).parse(body);
    return this.db.$transaction(async (tx) => {
      const ad = await tx.advertisement.update({ where: { id: adId }, data });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "ADVERTISEMENT_STATUS_UPDATED",
          entityType: "Advertisement",
          entityId: adId,
        },
      });
      return ad;
    });
  }
  @Get("advertisements") async publicAds(@Query("location") location: string) {
    if (!location) return [];
    const ancestors: string[] = [];
    let next: string | null = location;
    for (let depth = 0; next && depth < 10; depth++) {
      const l: { id: string; parentId: string | null } | null =
        await this.db.location.findFirst({
          where: { id: next, active: true },
          select: { id: true, parentId: true },
        });
      if (!l) break;
      ancestors.push(l.id);
      next = l.parentId;
    }
    return this.db.advertisement.findMany({
      where: {
        active: true,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
        regionIds: { hasSome: ancestors },
      },
      select: {
        id: true,
        title: true,
        creativeUrl: true,
        targetUrl: true,
        placement: true,
      },
      take: 12,
    });
  }
  @Post("events") async event(@Body() body: unknown) {
    const data = z
      .object({
        type: z.enum([
          "CATALOGUE_VIEW",
          "OFFER_VIEW",
          "PRODUCT_CLICK",
          "SHARE",
          "AD_IMPRESSION",
          "AD_CLICK",
        ]),
        entityId: id,
        locationId: id.optional(),
      })
      .parse(body);
    let retailerId: string | undefined;
    if (data.type.startsWith("AD_")) {
      const ad = await this.db.advertisement.findFirst({
        where: {
          id: data.entityId,
          active: true,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
      });
      if (!ad) throw new NotFoundException();
      retailerId = ad.retailerId || undefined;
    } else if (data.type === "CATALOGUE_VIEW") {
      const flyer = await this.db.flyer.findFirst({
        where: {
          id: data.entityId,
          status: "READY",
          campaign: {
            status: "PUBLISHED",
            endsAt: { gt: new Date() },
            retailer: { status: "ACTIVE" },
          },
        },
        include: { campaign: true },
      });
      if (!flyer) throw new NotFoundException();
      retailerId = flyer.campaign.retailerId;
    } else {
      const offer = await this.db.offer.findFirst({
        where: {
          id: data.entityId,
          verification: "VERIFIED",
          endsAt: { gt: new Date() },
          campaign: {
            status: "PUBLISHED",
            endsAt: { gt: new Date() },
            retailer: { status: "ACTIVE" },
          },
        },
      });
      if (!offer) throw new NotFoundException();
      retailerId = offer.retailerId;
    }
    await this.db.analyticsEvent.create({ data: { ...data, retailerId } });
    return { recorded: true };
  }
  @Get("retailer/:retailerId/analytics") async analytics(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
  ) {
    await this.security.retailer(req, retailerId);
    return this.db.analyticsEvent.groupBy({
      by: ["type"],
      where: {
        retailerId,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      _count: true,
    });
  }
  @Get("admin/users") async users(@Req() req: AuthRequest) {
    await this.security.admin(req);
    return this.db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  @Patch("admin/users/:userId") async user(
    @Req() req: AuthRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          active: z.boolean().optional(),
          role: z.enum(["CUSTOMER", "MODERATOR", "ADMIN"]).optional(),
        })
        .parse(body);
    const target = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      userId === a.id ||
      target.role === "SUPER_ADMIN" ||
      (data.role && a.role !== "SUPER_ADMIN")
    )
      throw new ConflictException(
        "This account change requires another super administrator",
      );
    return this.db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data,
        select: { id: true, active: true, role: true },
      });
      await tx.session.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "USER_ACCESS_UPDATED",
          entityType: "User",
          entityId: userId,
        },
      });
      return u;
    });
  }
  @Get("admin/content") async content(@Req() req: AuthRequest) {
    await this.security.admin(req);
    return this.db.contentBlock.findMany({ orderBy: { position: "asc" } });
  }
}
