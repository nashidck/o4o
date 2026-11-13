import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Response } from "express";
import * as argon2 from "argon2";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Db } from "./db";
import { storage } from "./uploads";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AuthRequest, Security, hash } from "./security";
import { scopeMatches, validateWindow, distanceKm } from "./domain";

const text = z.string().trim().min(1).max(200);
const id = z.string().min(1).max(100);
const date = z.coerce.date();
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  q: z.string().trim().max(100).default(""),
  location: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  retailer: z.string().max(100).optional(),
  sort: z
    .enum(["newest", "expiry", "price", "name", "popular", "discount"])
    .default("newest"),
});
const retailerInput = z.object({
  name: text,
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  description: z.string().max(5000).default(""),
  website: z
    .url()
    .refine((v) => /^https?:\/\//.test(v))
    .optional(),
});
const campaignInput = z.object({
  retailerId: id,
  title: text,
  description: z.string().max(10000).default(""),
  startsAt: date,
  endsAt: date,
  regionIds: z.array(id).max(100).default([]),
  branchIds: z.array(id).max(1000).default([]),
});
const liveCampaign = () => ({
  status: "PUBLISHED" as const,
  startsAt: { lte: new Date() },
  endsAt: { gt: new Date() },
  retailer: { status: "ACTIVE" as const },
});
const offerInclude = {
  variant: {
    include: { product: { include: { brand: true, category: true } } },
  },
  retailer: { select: { id: true, name: true, slug: true, logoUrl: true } },
  campaign: { include: { regions: true, branches: true } },
  branches: { include: { branch: { include: { location: true } } } },
  regions: { include: { location: true } },
} satisfies Prisma.OfferInclude;

@Controller()
export class AppController {
  constructor(
    private readonly db: Db,
    private readonly security: Security,
  ) {}
  private async ancestors(locationId: string) {
    const ids: string[] = [];
    let current: string | null = locationId;
    while (current && ids.length < 10) {
      const node: {
        id: string;
        parentId: string | null;
        active: boolean;
      } | null = await this.db.location.findUnique({
        where: { id: current },
        select: { id: true, parentId: true, active: true },
      });
      if (!node || !node.active)
        throw new BadRequestException("Unknown or inactive location");
      ids.push(node.id);
      current = node.parentId;
    }
    return ids;
  }
  private async regionalContext(locationId?: string) {
    if (!locationId) return null;
    const ancestors = await this.ancestors(locationId);
    const descendants: string[] = [locationId];
    let level = [locationId];
    for (let depth = 0; depth < 6 && level.length; depth++) {
      const children = await this.db.location.findMany({
        where: { parentId: { in: level }, active: true },
        select: { id: true },
      });
      level = children.map((c) => c.id);
      descendants.push(...level);
    }
    const branches = await this.db.branch.findMany({
      where: {
        locationId: { in: descendants },
        active: true,
        retailer: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    return { ancestors, descendants, branchIds: branches.map((b) => b.id) };
  }
  private regionalWhere(
    ctx: Awaited<ReturnType<AppController["regionalContext"]>>,
  ) {
    if (!ctx) return { id: { in: [] as string[] } };
    return {
      AND: [
        {
          OR: [
            {
              regions: {
                some: {
                  locationId: { in: [...ctx.ancestors, ...ctx.descendants] },
                },
              },
            },
            { regions: { none: {} } },
          ],
        },
        {
          OR: [
            { branches: { some: { branchId: { in: ctx.branchIds } } } },
            { branches: { none: {} } },
          ],
        },
        { OR: [{ regions: { some: {} } }, { branches: { some: {} } }] },
      ],
    };
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    await tx.auditLog.create({
      data: { actorId, action, entityType, entityId },
    });
  }
  private async ownedCampaign(req: AuthRequest, campaignId: string) {
    const campaign = await this.db.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException();
    const actor = await this.security.retailer(req, campaign.retailerId);
    return { campaign, actor };
  }

  @Get("health") async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok", service: "O4O API" };
  }
  @Get("locations") async locations(@Query() q: Record<string, string>) {
    return this.db.location.findMany({
      where: {
        active: true,
        ...(q.parent
          ? { parentId: id.parse(q.parent) }
          : q.q
            ? {}
            : { parentId: null }),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q.slice(0, 100), mode: "insensitive" } },
                { nameMl: { contains: q.q.slice(0, 100) } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  }
  @Get("categories") categories() {
    return this.db.category.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    });
  }
  @Get("content") content() {
    return this.db.contentBlock.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    });
  }

  @Post("auth/register") async register(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      req.get("origin") !== (process.env.WEB_ORIGIN || "http://localhost:3000")
    )
      throw new ForbiddenException("Invalid request origin");
    const data = z
      .object({
        name: text,
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
      })
      .parse(body);
    const user = await this.db.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await argon2.hash(data.password),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return { user, csrf: await this.security.createSession(user.id, res) };
  }
  @Post("auth/login") async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      req.get("origin") !== (process.env.WEB_ORIGIN || "http://localhost:3000")
    )
      throw new ForbiddenException("Invalid request origin");
    const data = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().max(128),
      })
      .parse(body);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    // Perform a real hash verification even for unknown emails to reduce account enumeration timing.
    const fallback =
      "$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$X3fR8RCwqCqbva8LuL14CAsV4cBQVIqF99qb3Gtx2ZE";
    const valid = await argon2
      .verify(user?.passwordHash || fallback, data.password)
      .catch(() => false);
    if (!user || !valid || !user.active)
      throw new UnauthorizedException("Invalid email or password");
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      csrf: await this.security.createSession(user.id, res),
    };
  }
  @Post("auth/logout") async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.security.actor(req);
    await this.db.session.deleteMany({
      where: { tokenHash: hash(req.cookies.o4o_session) },
    });
    res.clearCookie("o4o_session", { path: "/" });
    res.clearCookie("o4o_csrf", { path: "/" });
    return { success: true };
  }
  @Get("me") async me(@Req() req: AuthRequest) {
    const actor = await this.security.actor(req);
    return {
      ...actor,
      preference: await this.db.preference.findUnique({
        where: { userId: actor.id },
      }),
      memberships: await this.db.retailerMember.findMany({
        where: { userId: actor.id },
        include: { retailer: true },
      }),
    };
  }
  @Patch("me/preferences") async preferences(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const actor = await this.security.actor(req);
    const data = z
      .object({
        locationId: id.nullable().optional(),
        language: z.enum(["en", "ml"]).optional(),
        theme: z.enum(["system", "light", "dark"]).optional(),
        notifications: z.boolean().optional(),
      })
      .parse(body);
    if (data.locationId) await this.ancestors(data.locationId);
    return this.db.preference.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...data },
      update: data,
    });
  }
  @Delete("me") async deleteMe(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.security.actor(req);
    const data = z.object({ password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (!(await argon2.verify(user.passwordHash, data.password)))
      throw new UnauthorizedException("Incorrect password");
    if (actor.role !== "CUSTOMER")
      throw new ConflictException(
        "Transfer administrative or retailer responsibilities before deleting this account",
      );
    if (await this.db.retailerMember.count({ where: { userId: actor.id } }))
      throw new ConflictException(
        "Remove retailer memberships before deleting this account",
      );
    await this.db.user.delete({ where: { id: actor.id } });
    res.clearCookie("o4o_session", { path: "/" });
    return { deleted: true };
  }

  @Get("retailers") async retailers(@Query() query: unknown) {
    const q = paging.parse(query),
      ctx = await this.regionalContext(q.location);
    const where: Prisma.RetailerWhereInput = {
      status: "ACTIVE",
      name: { contains: q.q, mode: "insensitive" },
      ...(q.category
        ? { categories: { some: { category: { slug: q.category } } } }
        : {}),
      ...(ctx
        ? {
            branches: {
              some: { active: true, locationId: { in: ctx.descendants } },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.retailer.findMany({
        where,
        include: {
          categories: { include: { category: true } },
          _count: { select: { branches: true, follows: true } },
        },
        orderBy:
          q.sort === "popular"
            ? { follows: { _count: "desc" } }
            : q.sort === "newest"
              ? { createdAt: "desc" }
              : { name: "asc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.retailer.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  @Get("retailers/:slug") async retailer(@Param("slug") slug: string) {
    const item = await this.db.retailer.findFirst({
      where: { slug, status: "ACTIVE" },
      include: {
        categories: { include: { category: true } },
        branches: { where: { active: true }, include: { location: true } },
      },
    });
    if (!item) throw new NotFoundException();
    return item;
  }
  @Get("branches") async branches(@Query() query: Record<string, string>) {
    const ctx = await this.regionalContext(query.location);
    const items = await this.db.branch.findMany({
      where: {
        active: true,
        retailer: { status: "ACTIVE" },
        ...(ctx ? { locationId: { in: ctx.descendants } } : {}),
        ...(query.retailer ? { retailerId: query.retailer } : {}),
      },
      include: {
        retailer: { select: { name: true, slug: true } },
        location: true,
      },
      take: 100,
    });
    return items;
  }
  @Get("nearby") async nearby(@Query() query: unknown) {
    const q = z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        radius: z.coerce.number().min(1).max(50).default(10),
      })
      .parse(query);
    const latDelta = q.radius / 111;
    const lonDelta =
      q.radius / (111 * Math.max(0.01, Math.cos((q.latitude * Math.PI) / 180)));
    const candidates = await this.db.branch.findMany({
      where: {
        active: true,
        retailer: { status: "ACTIVE" },
        latitude: { gte: q.latitude - latDelta, lte: q.latitude + latDelta },
        longitude: { gte: q.longitude - lonDelta, lte: q.longitude + lonDelta },
      },
      include: { retailer: { select: { name: true, slug: true } } },
      take: 1000,
    });
    return candidates
      .map((b) => ({
        ...b,
        distanceKm: distanceKm(q, {
          latitude: b.latitude!,
          longitude: b.longitude!,
        }),
      }))
      .filter((b) => b.distanceKm <= q.radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 100);
  }
  @Get("campaigns") async campaigns(@Query() query: unknown) {
    const q = paging.parse(query),
      ctx = await this.regionalContext(q.location);
    const where: Prisma.CampaignWhereInput = {
      ...liveCampaign(),
      ...this.regionalWhere(ctx),
      title: { contains: q.q, mode: "insensitive" },
      ...(q.retailer ? { retailerId: q.retailer } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.campaign.findMany({
        where,
        include: {
          retailer: {
            select: { id: true, name: true, slug: true, logoUrl: true },
          },
          flyers: {
            where: { status: "READY" },
            select: {
              id: true,
              pageCount: true,
              pages: {
                orderBy: { number: "asc" },
                take: 1,
                select: { thumbnailKey: true },
              },
            },
          },
          branches: { include: { branch: { select: { name: true } } } },
          regions: { include: { location: true } },
        },
        orderBy:
          q.sort === "name"
            ? { title: "asc" }
            : q.sort === "expiry"
              ? { endsAt: "asc" }
              : { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.campaign.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  @Get("offers") async offers(@Query() query: unknown) {
    const q = paging
        .extend({
          minPrice: z.coerce.number().min(0).optional(),
          maxPrice: z.coerce.number().min(0).optional(),
          minDiscount: z.coerce.number().min(0).max(100).optional(),
          campaign: id.optional(),
        })
        .parse(query),
      ctx = await this.regionalContext(q.location);
    const where: Prisma.OfferWhereInput = {
      verification: "VERIFIED",
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
      retailer: { status: "ACTIVE" },
      ...this.regionalWhere(ctx),
      campaign: { ...liveCampaign(), ...this.regionalWhere(ctx) },
      ...(q.retailer ? { retailerId: q.retailer } : {}),
      ...(q.campaign ? { campaignId: q.campaign } : {}),
      price: { gte: q.minPrice, lte: q.maxPrice },
      ...(q.minDiscount !== undefined
        ? { discountPercent: { gte: q.minDiscount } }
        : {}),
      variant: {
        product: {
          ...(q.category ? { category: { slug: q.category } } : {}),
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { nameMl: { contains: q.q } },
          ],
        },
      },
    };
    const [items, total] = await Promise.all([
      this.db.offer.findMany({
        where,
        include: offerInclude,
        orderBy:
          q.sort === "name"
            ? { variant: { product: { name: "asc" } } }
            : q.sort === "discount"
              ? { discountPercent: { sort: "desc", nulls: "last" } }
              : q.sort === "price"
                ? { price: "asc" }
                : q.sort === "expiry"
                  ? { endsAt: "asc" }
                  : { createdAt: "desc" },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.offer.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  @Get("products") async products(@Query() query: unknown) {
    const q = paging.parse(query);
    const where: Prisma.ProductWhereInput = {
      OR: [
        { name: { contains: q.q, mode: "insensitive" } },
        { nameMl: { contains: q.q } },
        { brand: { name: { contains: q.q, mode: "insensitive" } } },
      ],
      ...(q.category ? { category: { slug: q.category } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.product.findMany({
        where,
        include: { brand: true, category: true, variants: true },
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.product.count({ where }),
    ]);
    return { items, total, page: q.page };
  }
  @Get("compare/:variantId") async compare(
    @Param("variantId") variantId: string,
    @Query("location") location: string,
  ) {
    const ctx = await this.regionalContext(location);
    return this.db.offer.findMany({
      where: {
        variantId,
        verification: "VERIFIED",
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
        retailer: { status: "ACTIVE" },
        ...this.regionalWhere(ctx),
        campaign: { ...liveCampaign(), ...this.regionalWhere(ctx) },
      },
      include: offerInclude,
      orderBy: { price: "asc" },
      take: 60,
    });
  }
  @Get("coupons") async coupons(@Query() query: unknown) {
    const q = paging.parse(query),
      ctx = await this.regionalContext(q.location);
    return this.db.coupon.findMany({
      where: {
        active: true,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
        retailer: { status: "ACTIVE" },
        ...this.regionalWhere(ctx),
        title: { contains: q.q, mode: "insensitive" },
        OR: [
          { campaignId: null },
          { campaign: { ...liveCampaign(), ...this.regionalWhere(ctx) } },
        ],
      },
      include: {
        retailer: { select: { name: true } },
        branches: { include: { branch: true } },
        regions: { include: { location: true } },
        restrictions: true,
      },
      take: q.limit,
      skip: (q.page - 1) * q.limit,
    });
  }
  @Get("catalogues/:flyerId") async catalogue(
    @Param("flyerId") flyerId: string,
    @Query("location") location: string,
  ) {
    const ctx = await this.regionalContext(location);
    const flyer = await this.db.flyer.findFirst({
      where: {
        id: flyerId,
        status: "READY",
        campaign: { ...liveCampaign(), ...this.regionalWhere(ctx) },
      },
      select: {
        id: true,
        filename: true,
        pageCount: true,
        downloadAllowed: true,
        campaign: {
          select: {
            title: true,
            endsAt: true,
            retailer: { select: { name: true } },
          },
        },
        pages: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            imageKey: true,
            thumbnailKey: true,
            width: true,
            height: true,
          },
        },
      },
    });
    if (!flyer)
      throw new NotFoundException(
        "Catalogue unavailable in this location or no longer active",
      );
    return flyer;
  }
  @Get("catalogues/:flyerId/pages/:number") async cataloguePage(
    @Param("flyerId") flyerId: string,
    @Param("number") number: string,
    @Query("location") location: string,
  ) {
    await this.catalogue(flyerId, location);
    const pageNumber = z.coerce.number().int().min(1).max(100).parse(number),
      ctx = await this.regionalContext(location);
    const page = await this.db.flyerPage.findUnique({
      where: { flyerId_number: { flyerId, number: pageNumber } },
      include: {
        regions: {
          where: {
            verification: "VERIFIED",
            offer: {
              verification: "VERIFIED",
              startsAt: { lte: new Date() },
              endsAt: { gt: new Date() },
              ...this.regionalWhere(ctx),
            },
          },
          include: { offer: { include: offerInclude } },
        },
      },
    });
    if (!page) throw new NotFoundException();
    return page;
  }
  @Get("catalogues/:flyerId/search") async catalogueSearch(
    @Param("flyerId") flyerId: string,
    @Query("location") location: string,
    @Query("q") query: string,
  ) {
    await this.catalogue(flyerId, location);
    const q = z.string().trim().min(2).max(100).parse(query);
    return this.db.flyerPage.findMany({
      where: { flyerId, text: { contains: q, mode: "insensitive" } },
      select: { number: true },
      take: 100,
    });
  }

  @Get("catalogues/:flyerId/download") async downloadCatalogue(
    @Param("flyerId") flyerId: string,
    @Query("location") location: string,
    @Res() res: Response,
  ) {
    const manifest = await this.catalogue(flyerId, location);
    if (!manifest.downloadAllowed)
      throw new ForbiddenException("Downloads are not permitted");
    const flyer = await this.db.flyer.findUniqueOrThrow({
      where: { id: flyerId },
    });
    const url = await getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: flyer.originalKey,
        ResponseContentDisposition: 'attachment; filename="catalogue.pdf"',
      }),
      { expiresIn: 60 },
    );
    res.setHeader("Cache-Control", "no-store");
    res.redirect(url);
  }
  @Get("me/follows") async follows(@Req() req: AuthRequest) {
    const a = await this.security.actor(req);
    return this.db.follow.findMany({
      where: { userId: a.id },
      include: { retailer: true },
    });
  }
  @Post("me/follows/:retailerId") async follow(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
  ) {
    const a = await this.security.actor(req);
    const retailer = await this.db.retailer.findFirst({
      where: { id: retailerId, status: "ACTIVE" },
    });
    if (!retailer) throw new NotFoundException();
    return this.db.follow.upsert({
      where: { userId_retailerId: { userId: a.id, retailerId } },
      create: { userId: a.id, retailerId },
      update: {},
    });
  }
  @Delete("me/follows/:retailerId") async unfollow(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
  ) {
    const a = await this.security.actor(req);
    return this.db.follow.deleteMany({ where: { userId: a.id, retailerId } });
  }
  @Get("me/saved") async saved(@Req() req: AuthRequest) {
    const a = await this.security.actor(req);
    return this.db.savedOffer.findMany({
      where: {
        userId: a.id,
        offer: { verification: "VERIFIED", retailer: { status: "ACTIVE" } },
      },
      include: { offer: { include: offerInclude } },
    });
  }
  @Post("me/saved/:offerId") async save(
    @Req() req: AuthRequest,
    @Param("offerId") offerId: string,
  ) {
    const a = await this.security.actor(req);
    const offer = await this.db.offer.findFirst({
      where: {
        id: offerId,
        verification: "VERIFIED",
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
        campaign: liveCampaign(),
        retailer: { status: "ACTIVE" },
      },
    });
    if (!offer) throw new NotFoundException("This offer is unavailable");
    return this.db.savedOffer.upsert({
      where: { userId_offerId: { userId: a.id, offerId } },
      create: { userId: a.id, offerId },
      update: {},
    });
  }
  @Delete("me/saved/:offerId") async unsave(
    @Req() req: AuthRequest,
    @Param("offerId") offerId: string,
  ) {
    const a = await this.security.actor(req);
    return this.db.savedOffer.deleteMany({ where: { userId: a.id, offerId } });
  }
  @Get("notifications") async notifications(@Req() req: AuthRequest) {
    const a = await this.security.actor(req);
    return this.db.notification.findMany({
      where: { userId: a.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Patch("notifications/:notificationId") async read(
    @Req() req: AuthRequest,
    @Param("notificationId") notificationId: string,
  ) {
    const a = await this.security.actor(req);
    return this.db.notification.updateMany({
      where: { id: notificationId, userId: a.id },
      data: { readAt: new Date() },
    });
  }

  @Get("lists") async lists(@Req() req: AuthRequest) {
    const a = await this.security.actor(req);
    return this.db.shoppingList.findMany({
      where: {
        OR: [{ ownerId: a.id }, { members: { some: { userId: a.id } } }],
      },
      include: {
        items: true,
        members: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  private async listAccess(req: AuthRequest, listId: string, owner = false) {
    const a = await this.security.actor(req);
    const list = await this.db.shoppingList.findFirst({
      where: {
        id: listId,
        OR: owner
          ? [{ ownerId: a.id }]
          : [
              { ownerId: a.id },
              { members: { some: { userId: a.id, role: "EDITOR" } } },
            ],
      },
    });
    if (!list) throw new NotFoundException("List unavailable");
    return { a, list };
  }
  @Post("lists") async createList(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.actor(req);
    const data = z.object({ name: text }).parse(body);
    return this.db.shoppingList.create({
      data: { ...data, ownerId: a.id },
      include: { items: true },
    });
  }
  @Post("lists/:listId/items") async addItem(
    @Req() req: AuthRequest,
    @Param("listId") listId: string,
    @Body() body: unknown,
  ) {
    await this.listAccess(req, listId);
    const data = z
      .object({
        name: text,
        variantId: id.optional(),
        quantity: z.number().positive().max(10000).default(1),
        note: z.string().max(1000).default(""),
      })
      .parse(body);
    return this.db.listItem.create({ data: { ...data, listId } });
  }
  @Patch("lists/:listId/items/:itemId") async editItem(
    @Req() req: AuthRequest,
    @Param("listId") listId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    await this.listAccess(req, listId);
    const data = z
      .object({
        name: text.optional(),
        quantity: z.number().positive().max(10000).optional(),
        note: z.string().max(1000).optional(),
        purchased: z.boolean().optional(),
        version: z.number().int().positive(),
      })
      .parse(body);
    const { version, ...changes } = data;
    return this.db.$transaction(async (tx) => {
      const changed = await tx.shoppingList.updateMany({
        where: { id: listId, version },
        data: { version: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException(
          "This list changed. Reload before editing.",
        );
      const result = await tx.listItem.updateMany({
        where: { id: itemId, listId },
        data: changes,
      });
      if (!result.count) throw new NotFoundException("Item not found");
      return result;
    });
  }
  @Delete("lists/:listId/items/:itemId") async deleteItem(
    @Req() req: AuthRequest,
    @Param("listId") listId: string,
    @Param("itemId") itemId: string,
  ) {
    await this.listAccess(req, listId);
    return this.db.listItem.deleteMany({ where: { id: itemId, listId } });
  }
  @Post("lists/:listId/members") async shareList(
    @Req() req: AuthRequest,
    @Param("listId") listId: string,
    @Body() body: unknown,
  ) {
    await this.listAccess(req, listId, true);
    const data = z
      .object({ email: z.email().transform((v) => v.toLowerCase()) })
      .parse(body);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    if (!user || !user.emailVerifiedAt)
      throw new NotFoundException(
        "This person must create an O4O account and verify their email before joining",
      );
    return this.db.listMember.upsert({
      where: { listId_userId: { listId, userId: user.id } },
      create: { listId, userId: user.id },
      update: {},
    });
  }
  @Delete("lists/:listId") async deleteList(
    @Req() req: AuthRequest,
    @Param("listId") listId: string,
  ) {
    await this.listAccess(req, listId, true);
    return this.db.shoppingList.delete({ where: { id: listId } });
  }

  @Get("retailer/overview") async retailerOverview(@Req() req: AuthRequest) {
    const a = await this.security.actor(req);
    return this.db.retailer.findMany({
      where: ["ADMIN", "SUPER_ADMIN"].includes(a.role)
        ? {}
        : { memberships: { some: { userId: a.id } } },
      include: {
        branches: { include: { location: true } },
        campaigns: { include: { flyers: true, regions: true, branches: true } },
        _count: { select: { offers: true, follows: true } },
      },
      take: 100,
    });
  }
  @Post("retailer/register") async registerRetailer(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.actor(req),
      data = retailerInput.parse(body);
    return this.db.$transaction(async (tx) => {
      const r = await tx.retailer.create({
        data: {
          ...data,
          memberships: { create: { userId: a.id, role: "OWNER" } },
        },
      });
      await this.audit(tx, a.id, "RETAILER_REGISTERED", "Retailer", r.id);
      return r;
    });
  }
  @Patch("retailer/:retailerId") async editRetailer(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.retailer(req, retailerId),
      data = retailerInput.omit({ slug: true }).partial().parse(body);
    return this.db.$transaction(async (tx) => {
      const r = await tx.retailer.update({ where: { id: retailerId }, data });
      await this.audit(tx, a.id, "RETAILER_UPDATED", "Retailer", retailerId);
      return r;
    });
  }
  @Post("retailer/:retailerId/branches") async createBranch(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.retailer(req, retailerId);
    const data = z
      .object({
        name: text,
        address: z.string().min(5).max(1000),
        locationId: id,
        postalCode: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        phone: z.string().max(30).optional(),
      })
      .parse(body);
    await this.ancestors(data.locationId);
    return this.db.$transaction(async (tx) => {
      const b = await tx.branch.create({ data: { ...data, retailerId } });
      await this.audit(tx, a.id, "BRANCH_CREATED", "Branch", b.id);
      return b;
    });
  }
  @Post("retailer/campaigns") async createCampaign(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const data = campaignInput.parse(body),
      a = await this.security.retailer(req, data.retailerId);
    if (!validateWindow(data.startsAt, data.endsAt))
      throw new BadRequestException("End must be after start");
    if (!data.regionIds.length && !data.branchIds.length)
      throw new BadRequestException("Choose regions or branches");
    if (
      (await this.db.branch.count({
        where: {
          id: { in: data.branchIds },
          retailerId: data.retailerId,
          active: true,
        },
      })) !== new Set(data.branchIds).size
    )
      throw new BadRequestException("Invalid participating branch");
    for (const locationId of data.regionIds) await this.ancestors(locationId);
    const { regionIds, branchIds, ...fields } = data;
    return this.db.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          ...fields,
          slug: `${fields.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`,
          regions: { create: regionIds.map((locationId) => ({ locationId })) },
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      });
      await this.audit(tx, a.id, "CAMPAIGN_CREATED", "Campaign", c.id);
      return c;
    });
  }
  @Post("retailer/campaigns/:campaignId/submit") async submit(
    @Req() req: AuthRequest,
    @Param("campaignId") campaignId: string,
  ) {
    const { campaign, actor } = await this.ownedCampaign(req, campaignId);
    if (!["DRAFT", "REJECTED"].includes(campaign.status))
      throw new ConflictException(
        "Campaign cannot be submitted in its current state",
      );
    return this.db.$transaction(async (tx) => {
      const c = await tx.campaign.updateMany({
        where: { id: campaignId, version: campaign.version },
        data: {
          status: "SUBMITTED",
          version: { increment: 1 },
          rejectionReason: null,
        },
      });
      if (!c.count)
        throw new ConflictException("Campaign changed; reload and retry");
      await this.audit(
        tx,
        actor.id,
        "CAMPAIGN_SUBMITTED",
        "Campaign",
        campaignId,
      );
      return c;
    });
  }
  @Get("admin/overview") async overview(@Req() req: AuthRequest) {
    await this.security.manager(req);
    const [
      customers,
      retailers,
      branches,
      campaigns,
      offers,
      catalogues,
      pending,
    ] = await Promise.all([
      this.db.user.count({ where: { role: "CUSTOMER" } }),
      this.db.retailer.count(),
      this.db.branch.count(),
      this.db.campaign.count({ where: liveCampaign() }),
      this.db.offer.count({
        where: {
          verification: "VERIFIED",
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
          campaign: liveCampaign(),
          retailer: { status: "ACTIVE" },
        },
      }),
      this.db.flyer.count(),
      this.db.campaign.count({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),
    ]);
    return {
      customers,
      retailers,
      branches,
      campaigns,
      offers,
      catalogues,
      pending,
    };
  }
  @Get("admin/retailers") async adminRetailers(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.retailer.findMany({
      include: { _count: { select: { branches: true, campaigns: true } } },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("admin/retailers") async adminCreateRetailer(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = retailerInput.parse(body);
    return this.db.$transaction(async (tx) => {
      const r = await tx.retailer.create({ data });
      await this.audit(tx, a.id, "RETAILER_CREATED", "Retailer", r.id);
      return r;
    });
  }
  @Patch("admin/retailers/:retailerId/status") async retailerStatus(
    @Req() req: AuthRequest,
    @Param("retailerId") retailerId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({ status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]) })
        .parse(body);
    return this.db.$transaction(async (tx) => {
      const r = await tx.retailer.update({
        where: { id: retailerId },
        data: { status: data.status },
      });
      await this.audit(
        tx,
        a.id,
        `RETAILER_${data.status}`,
        "Retailer",
        retailerId,
      );
      return r;
    });
  }
  @Get("admin/campaigns") async adminCampaigns(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.campaign.findMany({
      include: {
        revisions: true,
        retailer: true,
        branches: { include: { branch: true } },
        regions: { include: { location: true } },
        flyers: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("admin/campaigns/:campaignId/moderate") async moderate(
    @Req() req: AuthRequest,
    @Param("campaignId") campaignId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req),
      data = z
        .object({
          decision: z.enum(["APPROVED", "REJECTED", "PUBLISHED", "ARCHIVED"]),
          reason: z.string().max(2000).optional(),
          version: z.number().int().positive(),
        })
        .parse(body);
    if (data.decision === "REJECTED" && !data.reason?.trim())
      throw new BadRequestException("Provide a rejection reason");
    return this.db.$transaction(async (tx) => {
      const c = await tx.campaign.findUnique({
        where: { id: campaignId },
        include: { retailer: true },
      });
      if (!c) throw new NotFoundException();
      const allowed: Record<string, string[]> = {
        APPROVED: ["SUBMITTED", "UNDER_REVIEW"],
        REJECTED: ["SUBMITTED", "UNDER_REVIEW"],
        PUBLISHED: ["APPROVED", "SCHEDULED"],
        ARCHIVED: ["PUBLISHED", "APPROVED", "SCHEDULED", "EXPIRED"],
      };
      if (!allowed[data.decision].includes(c.status))
        throw new ConflictException("Invalid moderation transition");
      if (
        data.decision === "PUBLISHED" &&
        (c.retailer.status !== "ACTIVE" || c.endsAt <= new Date())
      )
        throw new BadRequestException(
          "Retailer must be active and campaign must not be expired",
        );
      const result = await tx.campaign.updateMany({
        where: { id: campaignId, version: data.version },
        data: {
          status:
            data.decision === "PUBLISHED" && c.startsAt > new Date()
              ? "SCHEDULED"
              : data.decision,
          rejectionReason: data.reason,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new ConflictException("Campaign changed; reload and retry");
      if (data.decision === "PUBLISHED" && c.startsAt <= new Date()) {
        const followers = await tx.follow.findMany({
          where: {
            retailerId: c.retailerId,
            user: {
              active: true,
              OR: [
                { preference: null },
                { preference: { notifications: true } },
              ],
            },
          },
          select: { userId: true },
        });
        await tx.notification.createMany({
          data: followers.map((f) => ({
            userId: f.userId,
            title: `New from ${c.retailer.name}`,
            body: c.title,
            href: `/campaigns?q=${encodeURIComponent(c.title)}`,
            dedupeKey: `campaign:${c.id}:${f.userId}`,
          })),
          skipDuplicates: true,
        });
      }
      await tx.moderation.create({
        data: {
          campaignId,
          actorId: a.id,
          decision: data.decision,
          reason: data.reason,
        },
      });
      await this.audit(
        tx,
        a.id,
        `CAMPAIGN_${data.decision}`,
        "Campaign",
        campaignId,
      );
      return result;
    });
  }
  @Get("admin/products") async adminProducts(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.product.findMany({
      include: { variants: true, category: true, brand: true },
      take: 100,
    });
  }
  @Post("admin/products") async createProduct(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req);
    const data = z
      .object({
        name: text,
        nameMl: text.optional(),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        categoryId: id,
        brandName: text.optional(),
        label: text,
        quantity: z.number().positive(),
        unit: z.enum(["g", "kg", "ml", "l", "each"]),
        packaging: text,
      })
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const brand = data.brandName
        ? await tx.brand.upsert({
            where: { name: data.brandName },
            create: { name: data.brandName },
            update: {},
          })
        : null;
      const p = await tx.product.create({
        data: {
          name: data.name,
          nameMl: data.nameMl,
          slug: data.slug,
          categoryId: data.categoryId,
          brandId: brand?.id,
          keywords: [],
          variants: {
            create: {
              label: data.label,
              quantity: data.quantity,
              unit: data.unit,
              packaging: data.packaging,
            },
          },
        },
        include: { variants: true },
      });
      await this.audit(tx, a.id, "PRODUCT_CREATED", "Product", p.id);
      return p;
    });
  }
  @Post("retailer/offers") async createOffer(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const data = z
      .object({
        campaignId: id,
        variantId: id,
        price: z.number().positive().max(10000000),
        originalPrice: z.number().positive().max(10000000).optional(),
        startsAt: date,
        endsAt: date,
        regionIds: z.array(id).max(100).default([]),
        branchIds: z.array(id).max(1000).default([]),
      })
      .parse(body);
    const { campaign, actor } = await this.ownedCampaign(req, data.campaignId);
    if (!["DRAFT", "REJECTED"].includes(campaign.status))
      throw new ConflictException("Add offers before submission");
    if (
      !validateWindow(data.startsAt, data.endsAt) ||
      data.startsAt < campaign.startsAt ||
      data.endsAt > campaign.endsAt
    )
      throw new BadRequestException(
        "Offer validity must be within campaign validity",
      );
    if (data.originalPrice && data.price > data.originalPrice)
      throw new BadRequestException("Offer price cannot exceed original price");
    if (!data.regionIds.length && !data.branchIds.length)
      throw new BadRequestException("Choose offer regions or branches");
    if (
      (await this.db.branch.count({
        where: {
          id: { in: data.branchIds },
          retailerId: campaign.retailerId,
          active: true,
        },
      })) !== new Set(data.branchIds).size
    )
      throw new BadRequestException("Invalid branch");
    const { regionIds, branchIds, ...fields } = data;
    return this.db.$transaction(async (tx) => {
      const o = await tx.offer.create({
        data: {
          ...fields,
          retailerId: campaign.retailerId,
          regions: { create: regionIds.map((locationId) => ({ locationId })) },
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      });
      await this.audit(tx, actor.id, "OFFER_CREATED", "Offer", o.id);
      return o;
    });
  }
  @Get("admin/offers") async adminOffers(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.offer.findMany({
      include: offerInclude,
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("admin/offers/:offerId/verify") async verifyOffer(
    @Req() req: AuthRequest,
    @Param("offerId") offerId: string,
  ) {
    const a = await this.security.manager(req);
    return this.db.$transaction(async (tx) => {
      const o = await tx.offer.update({
        where: { id: offerId },
        data: {
          verification: "VERIFIED",
          verifiedAt: new Date(),
          verifiedBy: a.id,
        },
      });
      await this.audit(tx, a.id, "OFFER_VERIFIED", "Offer", offerId);
      return o;
    });
  }
  @Get("admin/audit") async audits(@Req() req: AuthRequest) {
    await this.security.admin(req);
    return this.db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { name: true } } },
    });
  }
  @Post("admin/locations") async createLocation(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          code: text,
          name: text,
          nameMl: text.optional(),
          kind: z.enum(["COUNTRY", "STATE", "DISTRICT", "LOCALITY"]),
          parentId: id.optional(),
        })
        .parse(body);
    const parent = data.parentId
      ? await this.db.location.findUnique({ where: { id: data.parentId } })
      : null;
    const parents: Record<string, string | undefined> = {
      STATE: "COUNTRY",
      DISTRICT: "STATE",
      LOCALITY: "DISTRICT",
    };
    if (
      data.kind === "COUNTRY"
        ? data.parentId
        : !parent || parent.kind !== parents[data.kind]
    )
      throw new BadRequestException("Invalid location hierarchy");
    return this.db.$transaction(async (tx) => {
      const r = await tx.location.create({ data });
      await this.audit(tx, a.id, "LOCATION_CREATED", "Location", r.id);
      return r;
    });
  }
  @Post("admin/categories") async createCategory(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          name: text,
          nameMl: text.optional(),
          slug: z.string().regex(/^[a-z0-9-]+$/),
          parentId: id.optional(),
          position: z.number().int().default(0),
        })
        .parse(body);
    return this.db.$transaction(async (tx) => {
      const c = await tx.category.create({ data });
      await this.audit(tx, a.id, "CATEGORY_CREATED", "Category", c.id);
      return c;
    });
  }
  @Patch("admin/content/:key") async editContent(
    @Req() req: AuthRequest,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.admin(req),
      data = z
        .object({
          title: z.string().max(500),
          titleMl: z.string().max(500).optional(),
          description: z.string().max(3000),
          descriptionMl: z.string().max(3000).optional(),
          active: z.boolean().default(true),
        })
        .parse(body);
    return this.db.$transaction(async (tx) => {
      const c = await tx.contentBlock.update({ where: { key }, data });
      await this.audit(tx, a.id, "CONTENT_UPDATED", "ContentBlock", c.id);
      return c;
    });
  }
}
