import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Db } from "./db";
@Controller("search")
export class SearchController {
  constructor(private readonly db: Db) {}
  @Get() async search(@Query() query: unknown) {
    const q = z
      .object({
        q: z.string().trim().min(2).max(100),
        location: z.string().max(100).optional(),
      })
      .parse(query);
    const pattern = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    const products = await this.db.$queryRaw<
      { id: string; name: string; slug: string; kind: string }[]
    >(
      Prisma.sql`SELECT "id", "name", "slug", 'product' AS "kind" FROM "Product" WHERE "name" ILIKE ${pattern} OR "nameMl" ILIKE ${pattern} OR word_similarity(${q.q}, "name") > 0.35 OR EXISTS (SELECT 1 FROM unnest("keywords") k WHERE k ILIKE ${pattern}) ORDER BY similarity("name",${q.q}) DESC LIMIT 8`,
    );
    const retailerWhere: Prisma.RetailerWhereInput = {
      status: "ACTIVE",
      name: { contains: q.q, mode: "insensitive" },
    };
    let locations: string[] = [];
    const ancestors: string[] = [];
    if (q.location) {
      let next: string | null = q.location;
      for (let depth = 0; next && depth < 10; depth++) {
        const l: { id: string; parentId: string | null } | null =
          await this.db.location.findFirst({
            where: { id: next, active: true },
            select: { id: true, parentId: true },
          });
        if (!l) throw new BadRequestException("Unknown location");
        ancestors.push(l.id);
        next = l.parentId;
      }
      locations = [q.location];
      let level = [q.location];
      for (let depth = 0; level.length && depth < 6; depth++) {
        const nodes = await this.db.location.findMany({
          where: { parentId: { in: level }, active: true },
          select: { id: true },
        });
        level = nodes.map((n) => n.id);
        locations.push(...level);
      }
      retailerWhere.branches = {
        some: { locationId: { in: locations }, active: true },
      };
    }
    const retailers = await this.db.retailer.findMany({
      where: retailerWhere,
      select: { id: true, name: true, slug: true },
      take: 4,
    });
    const categories = await this.db.category.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: q.q, mode: "insensitive" } },
          { nameMl: { contains: q.q } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 4,
    });
    const branches = q.location
      ? await this.db.branch.findMany({
          where: { locationId: { in: locations }, active: true },
          select: { id: true },
        })
      : [];
    const scoped: Prisma.CampaignWhereInput = {
      status: "PUBLISHED",
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
      retailer: { status: "ACTIVE" },
      AND: [
        {
          OR: [
            { regions: { some: { locationId: { in: ancestors } } } },
            { regions: { none: {} } },
          ],
        },
        {
          OR: [
            {
              branches: {
                some: { branchId: { in: branches.map((b) => b.id) } },
              },
            },
            { branches: { none: {} } },
          ],
        },
        { OR: [{ regions: { some: {} } }, { branches: { some: {} } }] },
      ],
    };
    const campaigns = q.location
      ? await this.db.campaign.findMany({
          where: { ...scoped, title: { contains: q.q, mode: "insensitive" } },
          select: { id: true, title: true, slug: true },
          take: 4,
        })
      : [];
    const pages = q.location
      ? await this.db.flyerPage.findMany({
          where: {
            text: { contains: q.q, mode: "insensitive" },
            flyer: { status: "READY", campaign: scoped },
          },
          select: {
            id: true,
            number: true,
            flyerId: true,
            flyer: { select: { campaign: { select: { title: true } } } },
          },
          take: 4,
        })
      : [];
    return {
      items: [
        ...products.map((p) => ({
          ...p,
          href: `/products?q=${encodeURIComponent(p.name)}`,
        })),
        ...retailers.map((r) => ({
          ...r,
          kind: "retailer",
          href: `/retailers/${r.slug}`,
        })),
        ...categories.map((c) => ({
          ...c,
          kind: "category",
          href: `/offers?category=${c.slug}`,
        })),
        ...campaigns.map((c) => ({
          id: c.id,
          name: c.title,
          kind: "campaign",
          href: `/campaigns?q=${encodeURIComponent(c.title)}`,
        })),
        ...pages.map((p) => ({
          id: p.id,
          name: `${p.flyer.campaign.title} · Page ${p.number}`,
          kind: "catalogue page",
          href: `/catalogues/${p.flyerId}?page=${p.number}`,
        })),
      ],
    };
  }
}
