import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function updateMessageCounts() {
  try {
    console.log("채팅방 메시지 수 업데이트 시작...");
    
    // 모든 채팅방 가져오기
    const chats = await db.chat.findMany({
      select: { id: true }
    });
    
    console.log(`총 ${chats.length}개의 채팅방 업데이트...`);
    
    for (const chat of chats) {
      // 각 채팅방의 메시지 수 계산
      const messageCount = await db.message.count({
        where: { chatId: chat.id }
      });
      
      // 채팅방 메시지 수 업데이트
      await db.chat.update({
        where: { id: chat.id },
        data: { messageCount }
      });
      
      console.log(`채팅방 ID ${chat.id} 메시지 수: ${messageCount}`);
    }
    
    console.log("모든 채팅방 메시지 수 업데이트 완료!");
  } catch (error) {
    console.error("메시지 수 업데이트 중 오류 발생:", error);
  } finally {
    await db.$disconnect();
  }
}

updateMessageCounts(); 