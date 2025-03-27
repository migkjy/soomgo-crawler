import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 사용자 인증 확인 - 임시로 주석 처리
    /*
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    */

    const chatId = params.id;

    // 채팅의 hasNewMessage 플래그 초기화
    const updatedChat = await prisma.chat.update({
      where: {
        id: chatId,
      },
      data: {
        hasNewMessage: false
      },
    });

    return NextResponse.json(updatedChat);
  } catch (error) {
    console.error("[CHAT_NOTIFICATION_CLEAR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 