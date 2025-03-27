import { db } from "@/lib/db";
import { Chat, Message, ChatStatus } from "@prisma/client";

export async function upsertChat(chatData: {
  externalId: string;
  title: string;
  lastMessage: string;
  lastMessageTime: Date;
  hasNewMessage: boolean;
  unreadCount: number | null;
  price: string | null;
}) {
  return await db.chat.upsert({
    where: {
      externalId: chatData.externalId,
    },
    update: {
      title: chatData.title,
      lastMessage: chatData.lastMessage,
      lastMessageTime: chatData.lastMessageTime,
      hasNewMessage: chatData.hasNewMessage,
      unreadCount: chatData.unreadCount,
      price: chatData.price,
    },
    create: {
      externalId: chatData.externalId,
      title: chatData.title,
      lastMessage: chatData.lastMessage,
      lastMessageTime: chatData.lastMessageTime,
      hasNewMessage: chatData.hasNewMessage,
      unreadCount: chatData.unreadCount,
      price: chatData.price,
    },
  });
}

export async function upsertMessages(chatId: string, messages: {
  content: string;
  time: Date;
  isMe: boolean;
}[]) {
  return await Promise.all(
    messages.map(msg =>
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
}

export async function updateChatStatus(chatId: string, status: ChatStatus) {
  return await db.chat.update({
    where: { id: chatId },
    data: { status },
  });
}

export async function getChats(filter?: {
  status?: ChatStatus;
  hasNewMessage?: boolean;
}) {
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
}

export async function getChatMessages(chatId: string) {
  return await db.message.findMany({
    where: { chatId },
    orderBy: { time: "asc" },
  });
} 