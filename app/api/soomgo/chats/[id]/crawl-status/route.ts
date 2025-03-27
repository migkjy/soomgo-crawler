import { NextResponse } from "next/server";
import { auth } from "@/auth";

// 크롤링 상태를 저장할 Map (상태와 시간 정보 포함)
const crawlingStatus = new Map<string, {
  status: 'idle' | 'crawling' | 'completed' | 'error';
  timestamp: number;
}>();

// 크롤링 상태 설정 함수
export function setCrawlingStatus(chatId: string, status: 'idle' | 'crawling' | 'completed' | 'error') {
  crawlingStatus.set(chatId, {
    status,
    timestamp: Date.now()
  });
  console.log(`채팅 ID ${chatId}의 크롤링 상태가 '${status}'로 설정되었습니다.`);
}

// 상태를 조회하는 API
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 사용자 인증 확인
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const chatId = params.id;
    const statusData = crawlingStatus.get(chatId) || { status: 'idle', timestamp: 0 };

    // 마지막 상태 변경 후 30초가 지났고, 상태가 'crawling'이라면 'completed'로 간주
    const now = Date.now();
    const timeSinceUpdate = now - statusData.timestamp;
    
    if (statusData.status === 'crawling' && timeSinceUpdate > 30000) {
      console.log(`채팅 ID ${chatId}의 크롤링 상태가 시간 초과로 'completed'로 변경되었습니다.`);
      statusData.status = 'completed';
    }

    return NextResponse.json({
      status: statusData.status,
      timestamp: statusData.timestamp,
      timeSinceUpdate
    });
  } catch (error) {
    console.error("[CRAWL_STATUS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 