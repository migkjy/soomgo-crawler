import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(
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
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return new NextResponse("Status is required", { status: 400 });
    }

    // 채팅 상태 업데이트
    const updatedChat = await prisma.chat.update({
      where: {
        id: chatId,
      },
      data: {
        status,
      },
    });

    return NextResponse.json(updatedChat);
  } catch (error) {
    console.error("[CHAT_STATUS_UPDATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 