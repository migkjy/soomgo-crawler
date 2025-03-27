"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertCircle, RefreshCcw } from "lucide-react";

// 메시지 타입 정의
interface Message {
  id: string;
  content: string;
  time: string;
  isMe: boolean;
  messageType: 'CUSTOMER' | 'PRO' | 'SOOMGO';
}

interface ChatData {
  messages: Message[];
  projectDescription?: string;
}

interface CrawlStatus {
  status: string; // 'crawling', 'completed', 'error'
  timestamp: number;
  timeSinceUpdate?: string;
}

interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  unreadCount: number;
  hasNewMessage: boolean;
  serviceType?: string;
  userName?: string;
  location?: string;
  price?: string;
  status: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ChatDetailPage({ params }: { params: { id: string } }) {
  const chatId = params.id;
  const [isLoading, setIsLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  
  // SWR을 사용하여 메시지 가져오기
  const { data: chat, error: chatError, mutate: mutateChat } = useSWR<Chat>(
    `/api/soomgo/chats/${chatId}`,
    fetcher
  );

  // 메시지 가져오기 - 크롤링 중에는 자동 새로고침 비활성화
  const { data: messageData, error: messagesError, mutate: mutateMessages } = useSWR(
    `/api/soomgo/chats/${chatId}/messages`,
    fetcher,
    {
      refreshInterval: isCrawling ? 0 : 10000, // 크롤링 중에는 자동 새로고침 비활성화
      revalidateOnFocus: !isCrawling, // 크롤링 중에는 포커스시 새로고침 비활성화
    }
  );

  const messages = messageData?.messages || [];

  // 크롤링 상태 확인 - 크롤링 중일 때만 1초마다 새로고침
  const { data: crawlStatus, mutate: mutateCrawlStatus } = useSWR<CrawlStatus>(
    isCrawling ? `/api/soomgo/chats/${chatId}/crawl-status` : null,
    fetcher,
    {
      refreshInterval: isCrawling ? 1000 : 0, // 크롤링 중일 때만 1초마다 새로고침
      dedupingInterval: 500, // 중복 요청 방지
    }
  );

  // 크롤링 요청 함수
  const handleCrawlMessages = async () => {
    try {
      setIsCrawling(true);
      setCrawlStartTime(Date.now());
      setProgress(5);
      setErrorMessage(null);
      
      const response = await fetch(`/api/soomgo/chats/${chatId}/crawl`, {
        method: "POST",
      });
      
      if (response.ok) {
        toast.info("메시지 크롤링이 시작되었습니다.");
        checkCrawlingCompletion();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.message || "메시지 크롤링 시작에 실패했습니다.");
        setIsCrawling(false);
      }
    } catch (error) {
      console.error("메시지 크롤링 중 오류 발생:", error);
      toast.error("메시지 크롤링 중 오류가 발생했습니다.");
      setIsCrawling(false);
    }
  };

  // 크롤링 완료 여부 확인
  const checkCrawlingCompletion = () => {
    // 크롤링 시작 후 60초가 지나면 자동으로 종료 (타임아웃)
    const timeoutId = setTimeout(() => {
      if (isCrawling) {
        setIsCrawling(false);
        mutateChat();
        mutateMessages();
        toast.info("크롤링 시간이 초과되었습니다. 최신 데이터를 불러옵니다.");
      }
    }, 60000);

    return () => {
      clearTimeout(timeoutId);
    };
  };

  // 크롤링 진행 상태 관리
  useEffect(() => {
    if (isCrawling && crawlStatus) {
      console.log("크롤링 상태:", crawlStatus);

      if (crawlStatus.status === 'crawling') {
        // 진행 상태 업데이트 로직 (진행 속도 조정)
        setProgress((prev) => {
          const newProgress = Math.min(prev + 2, 90); // 90%까지만 자동 진행
          return newProgress;
        });
      } else if (crawlStatus.status === 'completed') {
        setProgress(100);
        console.log("크롤링이 완료되었습니다!");
        
        // 완료 후 약간의 지연 시간을 두고 상태 초기화 및 데이터 새로고침
        setTimeout(() => {
          setIsCrawling(false);
          toast.success("메시지 업데이트가 완료되었습니다.");
          
          // 데이터 새로고침
          mutateChat();
          mutateMessages();
        }, 1500);
      } else if (crawlStatus.status === 'error') {
        setProgress(100);
        setErrorMessage("메시지 크롤링 중 오류가 발생했습니다.");
        
        // 오류 발생 시에도 상태 초기화
        setTimeout(() => {
          setIsCrawling(false);
        }, 1500);
      }
    }
  }, [crawlStatus, isCrawling, mutateChat, mutateMessages]);

  // 메시지 수동 새로고침
  const handleRefreshMessages = () => {
    mutateMessages();
    toast.info("메시지 목록을 새로고침했습니다.");
  };

  if (chatError) return <div>채팅 정보를 불러오는 중 오류가 발생했습니다.</div>;
  if (!chat) return <div>채팅 정보를 불러오는 중...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {chat.title !== "제목 없음" && chat.title ? (
            chat.title
          ) : (
            <>
              {chat.userName ? chat.userName : "고객명 없음"} 
              {chat.serviceType && <span className="ml-2 text-muted-foreground">({chat.serviceType})</span>}
            </>
          )}
        </h1>
        <div className="flex gap-2">
          <Button
            onClick={handleRefreshMessages}
            disabled={isCrawling}
            variant="outline"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
          <Button
            onClick={handleCrawlMessages}
            disabled={isCrawling}
            variant={isCrawling ? "outline" : "default"}
          >
            {isCrawling ? "크롤링 중..." : "메시지 업데이트"}
          </Button>
          <Button
            onClick={() => router.push("/dashboard/soomgo")}
            variant="outline"
          >
            뒤로 가기
          </Button>
        </div>
      </div>
      
      {/* 고객 및 서비스 정보 카드 추가 */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-2 gap-4">
          {chat.userName && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">고객명</h3>
              <p className="text-base">{chat.userName}</p>
            </div>
          )}
          {chat.serviceType && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">서비스 유형</h3>
              <p className="text-base">{chat.serviceType}</p>
            </div>
          )}
          {chat.location && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">지역</h3>
              <p className="text-base">{chat.location}</p>
            </div>
          )}
          {chat.price && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">가격 정보</h3>
              <p className="text-base">{chat.price}</p>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">상태</h3>
            <Badge className="mt-1">{chat.status}</Badge>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">메시지 수</h3>
            <p className="text-base">{chat.messageCount || 0}개</p>
          </div>
        </div>
      </div>
      
      {isCrawling && (
        <div className="flex items-center mb-4 rounded bg-muted p-2">
          <span className="mr-2 animate-pulse">⏳</span>
          <p>메시지를 크롤링하는 중입니다. 잠시만 기다려주세요...</p>
        </div>
      )}
      
      <div className="min-h-[300px] space-y-4 rounded-md border p-4">
        {!messages ? (
          <p className="text-center text-muted-foreground">메시지를 불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-muted-foreground">메시지가 없습니다.</p>
        ) : (
          messages.map((message: Message) => (
            <div
              key={message.id || `msg-${Math.random()}`}
              className={`max-w-[80%] rounded-lg p-3 ${
                message.messageType === 'SOOMGO'
                  ? "mx-auto bg-yellow-100 dark:bg-yellow-900"
                  : message.messageType === 'PRO'
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted"
              }`}
            >
              <div className="mb-1 text-xs font-medium">
                {message.messageType === 'SOOMGO' && '숨고'}
                {message.messageType === 'PRO' && '고수'}
                {message.messageType === 'CUSTOMER' && '고객'}
              </div>
              <p>{message.content}</p>
              <p className="mt-1 text-xs opacity-70">
                {new Date(message.time).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      {/* 크롤링 진행 상태 표시 */}
      {isCrawling && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium">
              메시지 업데이트 중... {progress}%
            </span>
            <span className="text-sm text-muted-foreground">
              {crawlStatus?.status === 'crawling' && '크롤링 중...'}
              {crawlStatus?.status === 'completed' && '크롤링 완료!'}
              {crawlStatus?.status === 'error' && '크롤링 오류!'}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* 오류 메시지 표시 */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>오류</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
} 