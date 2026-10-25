import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Tx = Prisma.TransactionClient | typeof prisma;

export async function audit(
  db: Tx,
  userId: string,
  entity: string,
  entityId: string,
  action: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
) {
  const json = (v: Record<string, unknown> | null | undefined) =>
    v ? (JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as Prisma.InputJsonValue) : undefined;
  await db.auditLog.create({ data: { userId, entity, entityId, action, before: json(before), after: json(after) } });
}
