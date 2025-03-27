import { PrismaClient } from "@prisma/client";

// 직접 PrismaClient 인스턴스 생성
const db = new PrismaClient();

// 간단한 타입 정의
type ChatStatus = 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export async function upsertChatTest(chatData: any) {
  console.log(`다음 정보로 채팅 저장 시도:`, { externalId: chatData.externalId, title: chatData.title.substring(0, 25) + '...' });
  try {
    // 날짜 처리 로직 추가
    let lastMessageTime: Date | null = null;
    
    if (chatData.lastMessageTime) {
      // 'YYYY. MM. DD' 형식 처리
      if (/^\d{4}\.\s\d{2}\.\s\d{2}$/.test(chatData.lastMessageTime)) {
        lastMessageTime = new Date(chatData.lastMessageTime.replace(/\./g, '-').replace(/\s/g, ''));
      } 
      // '시간 전 접속', '일 전 접속' 등의 상대적 날짜 처리
      else if (chatData.lastMessageTime.includes('시간 전')) {
        const hours = parseInt(chatData.lastMessageTime.split('시간')[0].trim()) || 1;
        lastMessageTime = new Date();
        lastMessageTime.setHours(lastMessageTime.getHours() - hours);
      }
      else if (chatData.lastMessageTime.includes('일 전')) {
        const days = parseInt(chatData.lastMessageTime.split('일')[0].trim()) || 1;
        lastMessageTime = new Date();
        lastMessageTime.setDate(lastMessageTime.getDate() - days);
      }
      else {
        // 다른 형식은 현재 시간으로 설정
        lastMessageTime = new Date();
      }
    } else {
      lastMessageTime = new Date();
    }
    
    // 기존 채팅 찾기
    // @ts-ignore - Prisma 타입 문제 무시
    const existingChat = await db.chat.findUnique({
      where: { externalId: chatData.externalId }
    });

    if (existingChat) {
      // 기존 채팅 업데이트
      console.log(`기존 채팅 업데이트: ID=${existingChat.id}, externalId=${chatData.externalId}`);
      // @ts-ignore - Prisma 타입 문제 무시
      const updatedChat = await db.chat.update({
        where: { id: existingChat.id },
        data: {
          title: chatData.title,
          userName: chatData.userName || null,
          serviceType: chatData.serviceType || null,
          location: chatData.location || null,
          lastMessage: chatData.lastMessage,
          lastMessageTime: lastMessageTime,
          hasNewMessage: chatData.hasNewMessage || false,
          unreadCount: chatData.unreadCount,
          price: chatData.price,
          link: chatData.link
        }
      });
      console.log(`채팅 저장 성공: ${updatedChat.id}`);
      return updatedChat;
    } else {
      // 새 채팅 생성
      console.log(`새 채팅 생성: externalId=${chatData.externalId}`);
      // @ts-ignore - Prisma 타입 문제 무시
      return await db.chat.create({
        data: {
          externalId: chatData.externalId,
          title: chatData.title,
          userName: chatData.userName || null,
          serviceType: chatData.serviceType || null,
          location: chatData.location || null,
          lastMessage: chatData.lastMessage,
          lastMessageTime: lastMessageTime,
          hasNewMessage: chatData.hasNewMessage || false,
          unreadCount: chatData.unreadCount,
          price: chatData.price,
          link: chatData.link
        }
      });
    }
  } catch (error) {
    console.error("채팅 저장 중 오류 발생:", error);
    return null;
  }
}

export async function upsertMessagesTest(chatId: string, messages: {
  content: string;
  time: Date;
  isMe: boolean;
}[]) {
  try {
    // 먼저 이미 저장된 메시지를 확인
    // @ts-ignore - Prisma 타입 문제 무시
    const existingMessages = await db.message.findMany({
      where: { chatId },
      select: { content: true, time: true, isMe: true }
    });
    
    // 새 메시지만 필터링
    const newMessages = messages.filter(newMsg => {
      // 이미 동일한 내용과 시간의 메시지가 있는지 확인
      return !existingMessages.some(existingMsg => 
        existingMsg.content === newMsg.content && 
        existingMsg.time.getTime() === newMsg.time.getTime() &&
        existingMsg.isMe === newMsg.isMe
      );
    });
    
    console.log(`전체 메시지 ${messages.length}개 중 ${newMessages.length}개의 새 메시지 저장`);
    
    if (newMessages.length === 0) {
      return [];
    }
    
    return await Promise.all(
      newMessages.map(msg =>
        // @ts-ignore - Prisma 타입 문제 무시
        db.message.create({
          data: {
            chatId,
            content: msg.content,
            time: msg.time,
            isMe: msg.isMe,
          },
        })
      )
    );
  } catch (error) {
    console.error("메시지 저장 중 오류 발생:", error);
    return [];
  }
}

export async function updateChatStatusTest(chatId: string, status: ChatStatus) {
  try {
    // @ts-ignore - Prisma 타입 문제 무시
    return await db.chat.update({
      where: { id: chatId },
      data: { status },
    });
  } catch (error) {
    console.error("채팅 상태 업데이트 중 오류 발생:", error);
    return null;
  }
}

export async function getChatsTest(filter?: {
  status?: ChatStatus;
  hasNewMessage?: boolean;
}) {
  try {
    // @ts-ignore - Prisma 타입 문제 무시
    return await db.chat.findMany({
      where: filter,
      orderBy: { lastMessageTime: "desc" },
      include: {
        messages: {
          orderBy: { time: "desc" },
          take: 1,
        },
      },
    });
  } catch (error) {
    console.error("채팅 목록 조회 중 오류 발생:", error);
    return [];
  }
}

export async function getChatMessagesTest(chatId: string) {
  try {
    // @ts-ignore - Prisma 타입 문제 무시
    return await db.message.findMany({
      where: { chatId },
      orderBy: { time: "asc" },
    });
  } catch (error) {
    console.error("채팅 메시지 조회 중 오류 발생:", error);
    return [];
  }
} 