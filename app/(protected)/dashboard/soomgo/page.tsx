"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, RefreshCcw, Play, Bell, ExternalLink, Check, Plus, X, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";

interface Chat {
  id: string;
  title: string;
  userName?: string | null;
  serviceType?: string | null;
  location?: string | null;
  lastMessage: string | null;
  lastMessageTime: Date;
  status: string;
  price: string | null;
  unreadCount?: number | null;
  hasNewMessage?: boolean;
  link?: string | null;
  messageCount?: number;
}

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// 기본 상태 옵션들
const DEFAULT_STATUS_OPTIONS = [
  "NEW", "MESSAGED", "IN_PROGRESS", "QUOTED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"
];

// 기본적으로 제외할 상태들
const EXCLUDED_STATUSES = ["COMPLETED", "REJECTED", "CANCELLED"];

export default function SoomgoPage() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null);
  const [excludedStatuses, setExcludedStatuses] = useState<string[]>(EXCLUDED_STATUSES);
  const [pagination, setPagination] = useState<PaginationMeta>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 10,
    hasNext: false,
    hasPrev: false
  });
  
  const fetchChats = async (page = 1, statusFilter = selectedStatusFilter) => {
    try {
      setIsLoading(true);
      
      // URL 파라미터 구성
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString()
      });
      
      // 상태 필터 적용
      if (statusFilter) {
        params.append('status', statusFilter);
      } else if (excludedStatuses.length > 0) {
        // 특정 상태 제외 필터 적용
        excludedStatuses.forEach(status => {
          params.append('excludeStatus', status);
        });
      }
      
      const response = await fetch(`/api/soomgo/chats?${params.toString()}`);
      const data = await response.json();
      
      setChats(data.data);
      setPagination(data.meta);
    } catch (error) {
      console.error("Failed to fetch chats:", error);
      toast.error("채팅 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    fetchChats(page, selectedStatusFilter);
  };

  const startCrawling = async () => {
    try {
      setIsCrawling(true);
      toast.info("숨고 크롤링을 시작합니다. 잠시 기다려주세요...");
      
      const response = await fetch("/api/soomgo/crawl");
      
      if (response.ok) {
        // 크롤링 후 현재 필터 상태 유지하며 첫 페이지로 돌아가기
        fetchChats(1, selectedStatusFilter);
        toast.success("숨고 크롤링이 완료되었습니다.");
      } else {
        toast.error("크롤링 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Failed to start crawling:", error);
      toast.error("크롤링을 시작하는데 실패했습니다.");
    } finally {
      setIsCrawling(false);
    }
  };

  const updateChatStatus = async (chatId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/soomgo/chats/${chatId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('상태 업데이트에 실패했습니다.');
      }

      // 상태 업데이트 성공 시 로컬 상태 업데이트
      setChats(chats.map(chat => 
        chat.id === chatId ? { ...chat, status: newStatus } : chat
      ));
      
      toast.success("상태가 업데이트되었습니다.");
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("상태 업데이트에 실패했습니다.");
    }
  };

  const clearNewMessageNotification = async (chatId: string) => {
    try {
      const response = await fetch(`/api/soomgo/chats/${chatId}/clear-notification`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('알림 초기화에 실패했습니다.');
      }

      // 로컬 상태 업데이트 - hasNewMessage 플래그 제거
      setChats(chats.map(chat => 
        chat.id === chatId ? { ...chat, hasNewMessage: false } : chat
      ));
      
      toast.success("알림이 초기화되었습니다.");
    } catch (error) {
      console.error("Failed to clear notification:", error);
      toast.error("알림 초기화에 실패했습니다.");
    }
  };

  const handleMessageBadgeClick = async (chatId: string) => {
    // 알림 클리어
    await clearNewMessageNotification(chatId);
    
    // openSoomgoChat 함수가 이미 있으므로 여기서는 호출하지 않음
    // 사용자가 링크 버튼을 별도로 클릭하게 함
  };

  const addNewStatus = () => {
    if (!newStatusName.trim()) {
      toast.error("상태 이름을 입력해주세요.");
      return;
    }
    
    if (statusOptions.includes(newStatusName)) {
      toast.error("이미 존재하는 상태 이름입니다.");
      return;
    }
    
    // 새 상태 추가
    setStatusOptions([...statusOptions, newStatusName]);
    setNewStatusName("");
    setIsStatusDialogOpen(false);
    toast.success(`새 상태 "${newStatusName}"가 추가되었습니다.`);
    
    // 상태 목록을 로컬 스토리지에 저장
    localStorage.setItem('soomgoStatusOptions', JSON.stringify([...statusOptions, newStatusName]));
  };

  const removeStatus = (statusToRemove: string) => {
    // 기본 상태는 삭제할 수 없도록 방지
    if (DEFAULT_STATUS_OPTIONS.includes(statusToRemove)) {
      toast.error("기본 상태는 삭제할 수 없습니다.");
      return;
    }
    
    // 선택한 상태 삭제
    const updatedOptions = statusOptions.filter(status => status !== statusToRemove);
    setStatusOptions(updatedOptions);
    
    // 로컬 스토리지 업데이트
    localStorage.setItem('soomgoStatusOptions', JSON.stringify(updatedOptions));
    
    toast.success(`상태 "${statusToRemove}"가 삭제되었습니다.`);
  };

  const getStatusColorVariant = (status: string) => {
    switch(status) {
      case 'NEW': return 'default';
      case 'MESSAGED': return 'info';
      case 'IN_PROGRESS': return 'secondary';
      case 'QUOTED': return 'warning';
      case 'ACCEPTED': return 'success';
      case 'REJECTED': return 'destructive';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'destructive';
      default: return 'outline';
    }
  };

  // 상태 필터 변경 핸들러
  const handleStatusFilterChange = (status: string | null) => {
    setSelectedStatusFilter(status);
    fetchChats(1, status); // 필터 변경 시 첫 페이지로 돌아가고 새 상태 값 직접 전달
  };

  // 각 상태별 채팅 수 계산 (API가 이 정보를 제공하지 않으므로 클라이언트 측에서 계산)
  const getStatusCount = (status: string) => {
    return chats.filter(chat => chat.status === status).length;
  };

  useEffect(() => {
    fetchChats(1, selectedStatusFilter);
    
    // 로컬 스토리지에서 사용자 정의 상태 옵션 불러오기
    const savedOptions = localStorage.getItem('soomgoStatusOptions');
    if (savedOptions) {
      try {
        setStatusOptions(JSON.parse(savedOptions));
      } catch (e) {
        console.error('Failed to parse saved status options', e);
      }
    }
    
    // 로컬 스토리지에서 제외 상태 설정 불러오기
    const savedExcludedStatuses = localStorage.getItem('soomgoExcludedStatuses');
    if (savedExcludedStatuses) {
      try {
        setExcludedStatuses(JSON.parse(savedExcludedStatuses));
      } catch (e) {
        console.error('Failed to parse saved excluded statuses', e);
      }
    }
  }, []);  // selectedStatusFilter 제거 (handleStatusFilterChange에서 직접 호출)

  const formatDate = (date: Date) => {
    // 더 간결한 형식으로 변경
    return new Date(date).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openSoomgoChat = (link: string) => {
    if (link) {
      // 숨고 도메인 추가 (링크가 상대 경로인 경우)
      const fullLink = link.startsWith('http') ? link : `https://soomgo.com${link}`;
      window.open(fullLink, '_blank');
    }
  };

  // 채팅 항목 클릭 핸들러
  const handleChatClick = (chatId: string) => {
    router.push(`/dashboard/soomgo/${chatId}`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">숨고 채팅 관리</h1>
        <div className="flex space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                {selectedStatusFilter ? `${selectedStatusFilter}` : "모든 상태"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>상태별 필터</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedStatusFilter === null}
                onCheckedChange={() => handleStatusFilterChange(null)}
              >
                모든 상태
              </DropdownMenuCheckboxItem>
              {statusOptions.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={selectedStatusFilter === status}
                  onCheckedChange={() => handleStatusFilterChange(status)}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center">
                      <Badge 
                        variant={getStatusColorVariant(status) as any}
                        className="mr-2"
                      >
                        {status}
                      </Badge>
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                상태 관리
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>상태 옵션 관리</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="new-status">새 상태 추가</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="new-status" 
                      value={newStatusName} 
                      onChange={(e) => setNewStatusName(e.target.value)}
                      placeholder="상태 이름 입력"
                    />
                    <Button 
                      onClick={addNewStatus} 
                      type="button"
                      className="w-24"
                    >
                      추가
                    </Button>
                  </div>
                </div>
                <div className="mt-2">
                  <Label>현재 상태 목록</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {statusOptions.map((status, index) => (
                      <div key={index} className="flex items-center space-x-1 bg-muted/50 rounded-md pl-1 pr-0.5 py-0.5">
                        <Badge variant={getStatusColorVariant(status) as any}>
                          {status}
                        </Badge>
                        <Button 
                          variant="ghost"
                          size="icon" 
                          className="h-5 w-5 rounded-full hover:bg-destructive/10" 
                          onClick={() => removeStatus(status)}
                          disabled={DEFAULT_STATUS_OPTIONS.includes(status)}
                          title={DEFAULT_STATUS_OPTIONS.includes(status) ? "기본 상태는 삭제할 수 없습니다" : "상태 삭제"}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsStatusDialogOpen(false)}>닫기</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={startCrawling}
            disabled={isCrawling}
            variant="default"
            size="sm"
          >
            <Play className="mr-2 h-4 w-4" />
            크롤링 시작
          </Button>
          <Button
            onClick={() => fetchChats(pagination.currentPage, selectedStatusFilter)}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      </div>

      {selectedStatusFilter && (
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Badge variant={getStatusColorVariant(selectedStatusFilter) as any} className="mr-2">
              {selectedStatusFilter}
            </Badge>
            <span>상태의 채팅만 표시 중</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleStatusFilterChange(null)}
            className="text-muted-foreground"
          >
            필터 초기화
          </Button>
        </div>
      )}

      {!selectedStatusFilter && excludedStatuses.length > 0 && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span>기본적으로 다음 상태 제외:</span>
            {excludedStatuses.map(status => (
              <Badge key={status} variant={getStatusColorVariant(status) as any}>
                {status}
              </Badge>
            ))}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setExcludedStatuses([]);
              localStorage.setItem('soomgoExcludedStatuses', JSON.stringify([]));
              fetchChats(1, null);
            }}
            className="text-muted-foreground"
          >
            모든 상태 표시
          </Button>
        </div>
      )}

      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-muted-foreground">
            총 {pagination.totalItems}개 중 {(pagination.currentPage - 1) * pagination.limit + 1}-
            {Math.min(pagination.currentPage * pagination.limit, pagination.totalItems)}개 표시
          </div>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-auto whitespace-nowrap">고객명</TableHead>
              <TableHead className="w-auto whitespace-nowrap">서비스 유형</TableHead>
              <TableHead className="w-auto">메시지</TableHead>
              <TableHead className="w-[60px] text-center">메시지 수</TableHead>
              <TableHead className="w-[80px] text-center">안 읽은 메시지</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-[100px]">최근접속</TableHead>
              <TableHead className="text-right w-[60px]">링크</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  채팅 목록을 불러오는 중...
                </TableCell>
              </TableRow>
            ) : chats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  채팅이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              chats.map((chat) => (
                <TableRow key={chat.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleChatClick(chat.id)}>
                  <TableCell>{chat.userName || "-"}</TableCell>
                  <TableCell>{chat.serviceType || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      {chat.hasNewMessage ? (
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMessageBadgeClick(chat.id);
                          }}
                        >
                          <MessageCircle className="h-3 w-3" />
                          새 메시지
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground break-words">
                          {chat.lastMessage || "-"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{chat.messageCount || 0}</TableCell>
                  <TableCell className="text-center">
                    {chat.unreadCount ? (
                      <Badge variant="destructive" className="cursor-pointer">
                        {chat.unreadCount}
                      </Badge>
                    ) : (
                      <span>-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Badge 
                            variant={getStatusColorVariant(chat.status) as any} 
                            className="cursor-pointer"
                          >
                            {chat.status}
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>상태 변경</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {statusOptions.map((status) => (
                            <DropdownMenuItem 
                              key={status}
                              onClick={() => {
                                updateChatStatus(chat.id, status);
                              }}
                            >
                              {status === chat.status && <Check className="mr-2 h-4 w-4" />}
                              {status}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDate(chat.lastMessageTime)}
                  </TableCell>
                  <TableCell className="text-right">
                    {chat.link ? (
                      <a
                        href={chat.link.startsWith('http') ? chat.link : `https://soomgo.com${chat.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-500 hover:underline"
                      >
                        링크
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {pagination.totalPages > 1 && (
          <div className="mt-4 flex justify-center">
            <Pagination
              totalPages={pagination.totalPages}
              currentPage={pagination.currentPage}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </Card>
    </div>
  );
} 