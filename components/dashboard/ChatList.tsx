import { Chat } from '@prisma/client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ChatListProps {
  initialChats: Chat[];
}

export default function ChatList({ initialChats }: ChatListProps) {
  const [chats, setChats] = useState(initialChats);

  const getStatusBadge = (status: string) => {
    const statusColors = {
      NEW: 'bg-blue-500',
      IN_PROGRESS: 'bg-yellow-500',
      QUOTED: 'bg-purple-500',
      ACCEPTED: 'bg-green-500',
      REJECTED: 'bg-red-500',
      COMPLETED: 'bg-gray-500',
      CANCELLED: 'bg-gray-400',
    };

    return (
      <Badge className={`${statusColors[status]} text-white`}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {chats.map((chat) => (
        <Card key={chat.id} className="p-4 cursor-pointer hover:bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{chat.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{chat.lastMessage}</p>
            </div>
            <div className="flex flex-col items-end space-y-2">
              {getStatusBadge(chat.status)}
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(chat.lastMessageTime, { 
                  addSuffix: true,
                  locale: ko 
                })}
              </span>
              {chat.hasNewMessage && (
                <Badge className="bg-red-500 text-white">
                  {chat.unreadCount || '새 메시지'}
                </Badge>
              )}
            </div>
          </div>
          {chat.price && (
            <div className="mt-2 text-sm text-gray-600">
              견적: {chat.price}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
} 