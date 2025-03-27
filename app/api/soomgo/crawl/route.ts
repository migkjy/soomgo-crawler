import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";
import { SoomgoCrawler } from "@/lib/crawler/soomgo";

// Prisma 클라이언트 직접 초기화
const prisma = new PrismaClient();

export async function GET() {
  try {
    // 임시로 사용자 인증 확인 제거
    /*
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    */

    // 크롤러 초기화 및 실행
    const crawler = SoomgoCrawler.getInstance({
      credentials: {
        email: process.env.SOOMGO_EMAIL!,
        password: process.env.SOOMGO_PASSWORD!
      },
      browserOptions: {
        headless: true, // 백그라운드에서 실행
      }
    });

    try {
      // 로그인 시도 - 이미 로그인되어 있으면 스킵됨
      const loginSuccess = await crawler.login();
      
      if (!loginSuccess) {
        return new NextResponse("Failed to login to Soomgo", { status: 500 });
      }

      // 채팅 목록 가져오기 - 자동으로 DB에 저장됨
      await crawler.getChatList();
      
      // 브라우저는 종료하지 않음 (백그라운드에서 계속 실행)
    } catch (error) {
      console.error("Crawler error:", error);
      return new NextResponse(`Crawler error: ${error}`, { status: 500 });
    }

    // DB에서 저장된 채팅 목록 가져오기
    const chats = await prisma.chat.findMany({
      orderBy: {
        lastMessageTime: "desc",
      },
    });

    return NextResponse.json(chats);
  } catch (error) {
    console.error("[SOOMGO_CRAWL]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 