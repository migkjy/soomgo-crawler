import { ButtonProps } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface PaginationProps {
  className?: string
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
}

export function Pagination({
  className,
  totalPages,
  currentPage,
  onPageChange,
}: PaginationProps) {
  // 이전 페이지와 다음 페이지
  const prevPage = currentPage > 1 ? currentPage - 1 : null
  const nextPage = currentPage < totalPages ? currentPage + 1 : null

  // 페이지 번호 배열 생성
  const getPageNumbers = () => {
    const pages: number[] = []
    // 처음 페이지
    pages.push(1)
    
    // 현재 페이지 주변 페이지 (최대 1개씩)
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      if (i === 2 && currentPage > 3) {
        pages.push(-1) // 엘립시스 표시용
      }
      pages.push(i)
    }
    
    // 마지막 페이지
    if (totalPages > 1) {
      if (currentPage < totalPages - 2) {
        pages.push(-2) // 엘립시스 표시용
      }
      pages.push(totalPages)
    }
    
    return pages
  }

  return (
    <nav
      className={cn("flex items-center justify-center space-x-1", className)}
      role="navigation"
      aria-label="페이지네이션"
    >
      <PaginationItem onClick={() => prevPage && onPageChange(prevPage)} disabled={!prevPage}>
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">이전 페이지</span>
      </PaginationItem>
      
      {getPageNumbers().map((page, i) => {
        if (page < 0) {
          return (
            <PaginationEllipsis key={`ellipsis-${i}`} />
          )
        }
        
        return (
          <PaginationItem
            key={page}
            onClick={() => onPageChange(page)}
            isActive={currentPage === page}
          >
            {page}
          </PaginationItem>
        )
      })}
      
      <PaginationItem onClick={() => nextPage && onPageChange(nextPage)} disabled={!nextPage}>
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">다음 페이지</span>
      </PaginationItem>
    </nav>
  )
}

type PaginationItemProps = ButtonProps & {
  isActive?: boolean
}

function PaginationItem({
  className,
  isActive,
  ...props
}: PaginationItemProps) {
  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "h-8 w-8 p-0 text-center font-medium",
        {
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground": isActive,
        },
        className
      )}
      variant={isActive ? "default" : "outline"}
      size="sm"
      {...props}
    />
  )
}

function PaginationEllipsis({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-8 w-8 items-center justify-center", className)}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">더 많은 페이지</span>
    </div>
  )
} 