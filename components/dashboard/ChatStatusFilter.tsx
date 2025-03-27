import { ChatStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';

const statusLabels = {
  NEW: '새로운 문의',
  IN_PROGRESS: '상담 진행중',
  QUOTED: '견적 제시됨',
  ACCEPTED: '견적 수락됨',
  REJECTED: '견적 거절됨',
  COMPLETED: '완료됨',
  CANCELLED: '취소됨',
};

interface ChatStatusFilterProps {
  onStatusChange?: (status: ChatStatus | null) => void;
  currentStatus?: ChatStatus | null;
}

export default function ChatStatusFilter({
  onStatusChange,
  currentStatus = null,
}: ChatStatusFilterProps) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold mb-4">상태 필터</h2>
      <div className="flex flex-col gap-2">
        <Button
          variant={currentStatus === null ? "default" : "outline"}
          onClick={() => onStatusChange?.(null)}
          className="justify-start"
        >
          전체
        </Button>
        {Object.entries(statusLabels).map(([status, label]) => (
          <Button
            key={status}
            variant={currentStatus === status ? "default" : "outline"}
            onClick={() => onStatusChange?.(status as ChatStatus)}
            className="justify-start"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
} 