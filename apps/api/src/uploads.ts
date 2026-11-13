import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Response } from "express";
import { Db } from "./db";
import { Security, AuthRequest } from "./security";

export function storage() {
  if (
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY ||
    !process.env.S3_BUCKET
  )
    throw new ServiceUnavailableException("Object storage is not configured");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}
export function redisConnection() {
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
@Controller()
export class UploadController {
  constructor(
    private readonly db: Db,
    private readonly security: Security,
  ) {}
  @Get("admin/pages/:pageId/asset") async preview(
    @Req() req: AuthRequest,
    @Param("pageId") pageId: string,
    @Res() res: Response,
  ) {
    await this.security.manager(req);
    const page = await this.db.flyerPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException();
    const url = await getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: page.imageKey,
        ResponseContentType: "image/webp",
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: 120 },
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.redirect(url);
  }
  @Post("uploads") async upload(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const data = z
      .object({
        campaignId: z.string(),
        filename: z.string().min(1).max(200),
        mimeType: z.enum([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(50 * 1024 * 1024),
      })
      .parse(body);
    const campaign = await this.db.campaign.findUnique({
      where: { id: data.campaignId },
    });
    if (!campaign) throw new NotFoundException();
    const actor = await this.security.retailer(req, campaign.retailerId);
    if (!["DRAFT", "REJECTED"].includes(campaign.status))
      throw new ConflictException("Upload only to draft campaigns");
    const client = storage(),
      key = `originals/${campaign.retailerId}/${randomUUID()}.${({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[data.mimeType]}`;
    const flyer = await this.db.$transaction(async (tx) => {
      const f = await tx.flyer.create({
        data: {
          campaignId: campaign.id,
          originalKey: key,
          filename: data.filename,
          mimeType: data.mimeType,
          byteSize: data.byteSize,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "UPLOAD_AUTHORISED",
          entityType: "Flyer",
          entityId: f.id,
        },
      });
      return f;
    });
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: data.mimeType,
        ContentLength: data.byteSize,
      }),
      { expiresIn: 300 },
    );
    return { flyerId: flyer.id, uploadUrl };
  }
  @Post("uploads/:flyerId/complete") async complete(
    @Req() req: AuthRequest,
    @Param("flyerId") flyerId: string,
  ) {
    const flyer = await this.db.flyer.findUnique({
      where: { id: flyerId },
      include: { campaign: true },
    });
    if (!flyer) throw new NotFoundException();
    await this.security.retailer(req, flyer.campaign.retailerId);
    if (flyer.status !== "UPLOADING")
      throw new ConflictException("Upload already submitted");
    const head = await storage().send(
      new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: flyer.originalKey,
      }),
    );
    if (
      head.ContentLength !== flyer.byteSize ||
      head.ContentType !== flyer.mimeType
    )
      throw new BadRequestException("Uploaded file metadata does not match");
    const queue = new Queue("catalogues", { connection: redisConnection() });
    try {
      await queue.add(
        "process",
        { flyerId },
        {
          jobId: flyerId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
      await this.db.flyer.updateMany({
        where: { id: flyerId, status: "UPLOADING" },
        data: { status: "QUEUED" },
      });
      return { status: "QUEUED" };
    } finally {
      await queue.close();
    }
  }
  @Get("assets/:key") async asset(
    @Param("key") key: string,
    @Res() res: Response,
  ) {
    const page = await this.db.flyerPage.findFirst({
      where: {
        OR: [{ imageKey: key }, { thumbnailKey: key }],
        flyer: {
          status: "READY",
          campaign: {
            status: "PUBLISHED",
            startsAt: { lte: new Date() },
            endsAt: { gt: new Date() },
            retailer: { status: "ACTIVE" },
          },
        },
      },
    });
    if (!page) throw new NotFoundException();
    const signed = await getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ResponseContentType: "image/webp",
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: 120 },
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    res.redirect(signed);
  }
  @Get("admin/catalogues") async catalogues(@Req() req: AuthRequest) {
    await this.security.manager(req);
    return this.db.flyer.findMany({
      include: {
        campaign: {
          select: { title: true, retailer: { select: { name: true } } },
        },
        pages: { include: { regions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  @Post("admin/catalogues/:flyerId/publish") async publish(
    @Req() req: AuthRequest,
    @Param("flyerId") flyerId: string,
  ) {
    const a = await this.security.manager(req);
    return this.db.$transaction(async (tx) => {
      const f = await tx.flyer.findUnique({
        where: { id: flyerId },
        include: { _count: { select: { pages: true } } },
      });
      if (
        !f ||
        f.status !== "REVIEW" ||
        f._count.pages !== f.pageCount ||
        !f.pageCount
      )
        throw new BadRequestException(
          "All pages must finish processing before publication",
        );
      await tx.flyer.update({
        where: { id: flyerId },
        data: { status: "READY" },
      });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "CATALOGUE_VERIFIED",
          entityType: "Flyer",
          entityId: flyerId,
        },
      });
      return { status: "READY" };
    });
  }
  @Post("admin/catalogues/:flyerId/retry") async retry(
    @Req() req: AuthRequest,
    @Param("flyerId") flyerId: string,
  ) {
    await this.security.manager(req);
    const f = await this.db.flyer.findUnique({ where: { id: flyerId } });
    if (!f || f.status !== "FAILED")
      throw new ConflictException("Only failed jobs can be retried");
    const queue = new Queue("catalogues", { connection: redisConnection() });
    try {
      const job = await queue.getJob(flyerId);
      if (job && (await job.isFailed())) await job.retry();
      else
        await queue.add(
          "process",
          { flyerId },
          {
            jobId: flyerId,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          },
        );
      await this.db.flyer.update({
        where: { id: flyerId },
        data: { status: "QUEUED", error: null },
      });
      return { status: "QUEUED" };
    } finally {
      await queue.close();
    }
  }
  @Post("admin/pages/:pageId/regions") async hotspot(
    @Req() req: AuthRequest,
    @Param("pageId") pageId: string,
    @Body() body: unknown,
  ) {
    const a = await this.security.manager(req);
    const data = z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
        extractedText: z.string().max(3000),
        offerId: z.string(),
      })
      .parse(body);
    if (data.x + data.width > 1 || data.y + data.height > 1)
      throw new BadRequestException("Region extends beyond the page");
    const page = await this.db.flyerPage.findUnique({
        where: { id: pageId },
        include: { flyer: true },
      }),
      offer = await this.db.offer.findUnique({ where: { id: data.offerId } });
    if (
      !page ||
      !offer ||
      offer.campaignId !== page.flyer.campaignId ||
      offer.verification !== "VERIFIED"
    )
      throw new BadRequestException("Link a verified offer from this campaign");
    return this.db.$transaction(async (tx) => {
      const r = await tx.productRegion.create({
        data: { ...data, pageId, verification: "VERIFIED" },
      });
      await tx.auditLog.create({
        data: {
          actorId: a.id,
          action: "HOTSPOT_VERIFIED",
          entityType: "ProductRegion",
          entityId: r.id,
        },
      });
      return r;
    });
  }
}
