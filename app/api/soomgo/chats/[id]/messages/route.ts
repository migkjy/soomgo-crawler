import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 사용자 인증 확인
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const chatId = params.id;
    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    // 채팅 확인
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true }
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    // 메시지 조회 (시간 순으로 정렬)
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { time: 'asc' },
      select: {
        id: true,
        content: true,
        time: true,
        isMe: true,
        messageType: true
      }
    });

    // 캐싱 비활성화를 위한 헤더 설정
    const headers = new Headers();
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return NextResponse.json({ messages }, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error("메시지 조회 중 오류 발생:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
} 