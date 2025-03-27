import { PrismaClient } from "@prisma/client"
import "server-only";

declare global {
  var prisma: PrismaClient | undefined;
}

// PrismaClient 인스턴스 생성
const prismaClient = globalThis.prisma || new PrismaClient();

// 개발 환경에서 글로벌 객체에 할당하여 핫 리로딩 시 연결이 유지되도록 함
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prismaClient;
}

// 두 가지 이름으로 내보내기
export const db = prismaClient;
export const prisma = prismaClient; // 명시적으로 prisma 이름으로 내보내기

// Re-export common types
export type * from "@prisma/client";
