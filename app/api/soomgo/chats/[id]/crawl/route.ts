import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { SoomgoChatMessageCrawler } from "@/lib/crawler/soomgo";
import { setCrawlingStatus } from "../crawl-status/route";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chatId = params.id;
    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    // 크롤링 상태를 '크롤링 중'으로 설정
    setCrawlingStatus(chatId, 'crawling');
    
    console.log(`채팅 ID: ${chatId}의 메시지 크롤링을 시작합니다...`);
    
    const crawler = await SoomgoChatMessageCrawler.getInstance();
    await crawler.initialize();
    
    // 비동기적으로 실행 (요청을 차단하지 않음)
    // closeAfterComplete 옵션을 true로 설정하여 크롤링 완료 후 자동으로 브라우저 종료
    crawler.getChatMessages(chatId, true).then((result) => {
      if (result) {
        console.log(`채팅 ID: ${chatId}의 메시지 크롤링이 완료되었습니다.`);
        setCrawlingStatus(chatId, 'completed');
      } else {
        console.error(`채팅 ID: ${chatId}의 메시지 크롤링 중 오류가 발생했습니다.`);
        setCrawlingStatus(chatId, 'error');
      }
    }).catch((error) => {
      console.error(`크롤링 중 예외 발생:`, error);
      setCrawlingStatus(chatId, 'error');
    });

    return NextResponse.json({
      message: "크롤링이 시작되었습니다",
      status: "crawling",
      chatId: chatId
    });
  } catch (error) {
    console.error("API 호출 중 오류 발생:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
} 