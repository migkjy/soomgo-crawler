/**
 * 채팅 메시지 연결 수정 스크립트
 * 
 * 이미 크롤링된 메시지들을 위한 임시 채팅 정보를 생성합니다.
 */

import { PrismaClient } from "@prisma/client";

// Prisma 클라이언트 초기화
const prisma = new PrismaClient();

async function fixChatMessages() {
  try {
    // 1. 기존 채팅 정보 확인
    const chatId = "cm8rhw39c0002ai2iqj43td39";  // 크롤링 로그에서 확인한 ID
    
    // 2. 해당 ID로 채팅 존재 여부 확인
    // @ts-ignore - Prisma 타입 문제 무시
    const existingChat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (existingChat) {
      console.log("이미 채팅 정보가 존재합니다:", existingChat);
      
      // 해당 채팅에 연결된 메시지 확인
      // @ts-ignore - Prisma 타입 문제 무시
      const messages = await prisma.message.findMany({
        where: { chatId }
      });
      
      console.log(`${messages.length}개의 메시지가 연결되어 있습니다.`);
      return;
    }

    // 3. 채팅 정보가 없는 경우 새로 생성
    console.log("채팅 정보를 새로 생성합니다...");
    
    // 현재 externalId가 '133504634'인 채팅을 확인
    // @ts-ignore - Prisma 타입 문제 무시
    const existingChatByExternalId = await prisma.chat.findFirst({
      where: { externalId: "133504634" }
    });
    
    if (existingChatByExternalId) {
      console.log("externalId '133504634'로 이미 채팅이 존재합니다:", existingChatByExternalId);
      
      // 이미 존재하는 채팅에 메시지 연결
      // @ts-ignore - Prisma 타입 문제 무시
      const messagesWithNoChat = await prisma.message.findMany({
        where: { chatId }
      });
      
      console.log(`${messagesWithNoChat.length}개의 메시지를 다른 채팅으로 이동합니다...`);
      
      // 각 메시지의 채팅 ID 업데이트
      for (const message of messagesWithNoChat) {
        // @ts-ignore - Prisma 타입 문제 무시
        await prisma.message.update({
          where: { id: message.id },
          data: { chatId: existingChatByExternalId.id }
        });
      }
      
      console.log(`${messagesWithNoChat.length}개의 메시지가 채팅 ID ${existingChatByExternalId.id}로 이동되었습니다.`);
      return;
    }
    
    // 4. 새로운 채팅 생성
    // @ts-ignore - Prisma 타입 문제 무시
    const newChat = await prisma.chat.create({
      data: {
        id: chatId,  // 기존 메시지가 참조하는 ID 유지
        externalId: "133504634",  // 실제 숨고 채팅방 ID
        title: "앱/웹 개발 문의",
        userName: "고객님",
        serviceType: "앱/웹 개발",
        location: "서울",
        lastMessage: "안녕하세요. 요청 내용을 확인했습니다.",
        lastMessageTime: new Date(),
        hasNewMessage: false,
        unreadCount: 0,
        status: "NEW",
        price: "예상금액시간 당 30,000원 부터~",
        link: "https://soomgo.com/pro/chats/133504634"
      }
    });
    
    console.log("새 채팅이 생성되었습니다:", newChat);
    
    // 해당 채팅에 연결된 메시지 확인
    // @ts-ignore - Prisma 타입 문제 무시
    const messages = await prisma.message.findMany({
      where: { chatId }
    });
    
    console.log(`${messages.length}개의 메시지가 연결되어 있습니다.`);
    
  } catch (error) {
    console.error("오류 발생:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
fixChatMessages()
  .then(() => console.log("완료되었습니다."))
  .catch(error => console.error("스크립트 실행 중 오류 발생:", error)); 