import { Worker } from "bullmq";
import { createDb } from "../../../packages/database";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { detectCandidates } from "./detection";
const execute = promisify(execFile),
  db = createDb();
const redis = new URL(process.env.REDIS_URL || "redis://localhost:6379");
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});
const worker = new Worker(
  "catalogues",
  async (job) => {
    const flyer = await db.flyer.findUniqueOrThrow({
      where: { id: job.data.flyerId },
      include: { campaign: true },
    });
    if (["READY", "REVIEW"].includes(flyer.status)) return;
    const dir = await mkdtemp(join(tmpdir(), "o4o-catalogue-"));
    try {
      await db.flyer.update({
        where: { id: flyer.id },
        data: { status: "PROCESSING", error: null },
      });
      const object = await client.send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: flyer.originalKey,
        }),
      );
      if (!object.ContentLength || object.ContentLength > 50 * 1024 * 1024)
        throw new Error("Invalid original file size");
      const bytes = await object.Body!.transformToByteArray();
      const isPdf = flyer.mimeType === "application/pdf";
      if (isPdf && Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-")
        throw new Error("Invalid PDF signature");
      if (!isPdf) {
        const meta = await sharp(bytes, {
          limitInputPixels: 20000000,
        }).metadata();
        const expected = (
          {
            "image/jpeg": "jpeg",
            "image/png": "png",
            "image/webp": "webp",
          } as Record<string, string>
        )[flyer.mimeType];
        if (!expected || meta.format !== expected || (meta.pages || 1) > 1)
          throw new Error("Invalid or animated image");
      }
      const pdf = join(dir, "original.pdf");
      await writeFile(pdf, bytes);
      // Fail closed if the scanner or required converters are absent.
      await execute("clamscan", ["--no-summary", pdf], {
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      const digest = createHash("sha256").update(bytes).digest("hex");
      const duplicate = await db.flyer.findFirst({
        where: {
          sha256: digest,
          id: { not: flyer.id },
          campaign: { retailerId: flyer.campaign.retailerId },
          status: { in: ["READY", "REVIEW"] },
        },
      });
      if (duplicate)
        throw new Error(
          "Duplicate catalogue for this retailer; reuse the existing upload",
        );
      let count = 1;
      if (isPdf) {
        const info = await execute("pdfinfo", [pdf], {
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        if (/Encrypted:\s+yes/.test(info.stdout))
          throw new Error("Encrypted PDFs are unsupported");
        count = Number(info.stdout.match(/Pages:\s+(\d+)/)?.[1]);
        if (!count || count > 100)
          throw new Error("Catalogue must contain 1–100 pages");
      }
      await db.flyer.update({
        where: { id: flyer.id },
        data: { pageCount: count, sha256: digest },
      });
      for (let number = 1; number <= count; number++) {
        const prefix = join(dir, `page-${number}`),
          png = `${prefix}.png`,
          txt = `${prefix}.txt`;
        if (isPdf) {
          await execute(
            "pdftoppm",
            [
              "-f",
              String(number),
              "-l",
              String(number),
              "-singlefile",
              "-scale-to",
              "3000",
              "-png",
              pdf,
              prefix,
            ],
            { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true },
          );
          await execute(
            "pdftotext",
            ["-f", String(number), "-l", String(number), "-layout", pdf, txt],
            { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
          );
        } else {
          await sharp(bytes, { limitInputPixels: 20000000 })
            .rotate()
            .resize({
              width: 3000,
              height: 3000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toFile(png);
          await writeFile(txt, "");
        }
        let text = await readFile(txt, "utf8");
        await execute("tesseract", [png, prefix, "-l", "eng+mal", "tsv"], {
          timeout: 120000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        const tsv = await readFile(`${prefix}.tsv`, "utf8");
        if (text.trim().length < 30) {
          text = tsv
            .split("\n")
            .slice(1)
            .map((line) => line.split("\t")[11] || "")
            .filter(Boolean)
            .join(" ");
        }
        const image = sharp(await readFile(png), {
            limitInputPixels: 20000000,
          }),
          meta = await image.metadata();
        const imageKey = `pages/${flyer.id}/${number}.webp`,
          thumbnailKey = `pages/${flyer.id}/${number}-thumb.webp`;
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: imageKey,
            Body: await image.clone().webp({ quality: 85 }).toBuffer(),
            ContentType: "image/webp",
            CacheControl: "private, max-age=86400",
          }),
        );
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: thumbnailKey,
            Body: await image
              .clone()
              .resize({ width: 200 })
              .webp({ quality: 70 })
              .toBuffer(),
            ContentType: "image/webp",
            CacheControl: "private, max-age=86400",
          }),
        );
        const page = await db.flyerPage.upsert({
          where: { flyerId_number: { flyerId: flyer.id, number } },
          create: {
            flyerId: flyer.id,
            number,
            imageKey,
            thumbnailKey,
            width: meta.width!,
            height: meta.height!,
            text: text.slice(0, 100000),
          },
          update: {
            imageKey,
            thumbnailKey,
            width: meta.width!,
            height: meta.height!,
            text: text.slice(0, 100000),
          },
        });
        await db.productRegion.deleteMany({
          where: { pageId: page.id, verification: "UNVERIFIED" },
        });
        const candidates = detectCandidates(tsv, meta.width!, meta.height!);
        if (candidates.length)
          await db.productRegion.createMany({
            data: candidates.map((c) => ({
              ...c,
              pageId: page.id,
              verification: "UNVERIFIED",
            })),
          });
        await job.updateProgress(Math.round((number / count) * 100));
      }
      await db.flyer.update({
        where: { id: flyer.id },
        data: { status: "REVIEW" },
      });
    } catch (error) {
      await db.flyer.update({
        where: { id: flyer.id },
        data: {
          status: "FAILED",
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Processing failed",
        },
      });
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  {
    connection: {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      password: redis.password || undefined,
      ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
    },
    concurrency: 1,
    lockDuration: 180000,
  },
);
worker.on("failed", (job, error) =>
  console.error(JSON.stringify({ jobId: job?.id, error: error.message })),
);
const timer = setInterval(async () => {
  try {
    const now = new Date();
    await db.campaign.updateMany({
      where: {
        status: "SCHEDULED",
        startsAt: { lte: now },
        endsAt: { gt: now },
        retailer: { status: "ACTIVE" },
      },
      data: { status: "PUBLISHED" },
    });
    await db.campaign.updateMany({
      where: {
        status: { in: ["PUBLISHED", "SCHEDULED", "APPROVED"] },
        endsAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });
    const soon = await db.savedOffer.findMany({
      where: {
        offer: {
          verification: "VERIFIED",
          endsAt: { gt: now, lte: new Date(+now + 86400000) },
          campaign: { status: "PUBLISHED" },
          retailer: { status: "ACTIVE" },
        },
        user: {
          active: true,
          OR: [{ preference: null }, { preference: { notifications: true } }],
        },
      },
      include: {
        offer: { include: { variant: { include: { product: true } } } },
      },
      take: 1000,
    });
    await db.notification.createMany({
      data: soon.map((s) => ({
        userId: s.userId,
        title: "A saved offer is ending soon",
        body: s.offer.variant.product.name,
        href: "/saved",
        dedupeKey: `expiry:${s.offerId}:${s.userId}`,
      })),
      skipDuplicates: true,
    });
    await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.recoveryToken.deleteMany({ where: { expiresAt: { lte: now } } });
  } catch (error) {
    console.error("Campaign lifecycle update failed");
  }
}, 30000);
async function close() {
  clearInterval(timer);
  await worker.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
console.log("O4O catalogue worker ready");
