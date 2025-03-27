import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";

// Prisma 클라이언트 직접 초기화
const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    // 임시로 사용자 인증 확인 제거
    /*
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    */

    // URL 파라미터 가져오기
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;
    
    // 상태 필터 (선택적)
    const status = searchParams.get('status');
    
    // 제외할 상태 필터 (다중)
    const excludeStatuses = searchParams.getAll('excludeStatus');
    
    // 필터 조건 생성
    let where: any = {};
    
    // 상태 필터 적용
    if (status) {
      where.status = status;
    }
    
    // 제외 상태 필터 적용
    if (excludeStatuses.length > 0) {
      where.status = {
        notIn: excludeStatuses
      };
    }
    
    console.log("API 필터링 조건:", where); // 디버깅용
    
    // 총 항목 수 가져오기
    const totalItems = await prisma.chat.count({
      where
    });
    
    // 페이지네이션된 채팅 목록 가져오기
    const chats = await prisma.chat.findMany({
      where,
      orderBy: {
        lastMessageTime: "desc",
      },
      skip,
      take: limit,
    });
    
    // 페이지네이션 메타데이터
    const totalPages = Math.ceil(totalItems / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    
    console.log(`처리된 결과: ${chats.length}개 항목, 총 ${totalItems}개, ${totalPages} 페이지`); // 디버깅용

    return NextResponse.json({
      data: chats,
      meta: {
        currentPage: page,
        totalPages,
        totalItems,
        limit,
        hasNext,
        hasPrev
      }
    });
  } catch (error) {
    console.error("[SOOMGO_CHATS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 