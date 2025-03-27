import { SoomgoCrawler } from "@/lib/crawler/soomgo";
import dotenv from "dotenv";
import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// 세션 정보 파일 관리
const SESSION_FILE_PATH = path.join(process.cwd(), 'crawler-session.json');

interface SessionData {
  isLoggedIn: boolean;
  lastLogin: string;
}

function saveSessionInfo(isLoggedIn: boolean) {
  const data: SessionData = {
    isLoggedIn,
    lastLogin: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(data, null, 2));
    console.log("세션 정보가 저장되었습니다.");
  } catch (error) {
    console.error("세션 정보 저장 실패:", error);
  }
}

function getSessionInfo(): SessionData | null {
  try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      const data = fs.readFileSync(SESSION_FILE_PATH, 'utf8');
      return JSON.parse(data) as SessionData;
    }
  } catch (error) {
    console.error("세션 정보 읽기 실패:", error);
  }
  return null;
}

async function main() {
  // 브라우저 인스턴스가 여러 개 실행되지 않도록 기존 쿠키 파일 삭제
  const COOKIES_PATH = path.join(process.cwd(), 'soomgo-cookies.json');
  if (fs.existsSync(COOKIES_PATH)) {
    console.log("기존 쿠키 파일 삭제");
    fs.unlinkSync(COOKIES_PATH);
  }

  // 세션 정보 파일도 초기화
  if (fs.existsSync(SESSION_FILE_PATH)) {
    console.log("기존 세션 정보 파일 삭제");
    fs.unlinkSync(SESSION_FILE_PATH);
  }

  const credentials = {
    email: process.env.SOOMGO_EMAIL!,
    password: process.env.SOOMGO_PASSWORD!,
  };

  // 자격 증명 확인
  if (!credentials.email || !credentials.password) {
    console.error("환경 변수에 SOOMGO_EMAIL 또는 SOOMGO_PASSWORD가 설정되지 않았습니다.");
    process.exit(1);
  }

  let crawler: SoomgoCrawler | undefined;
  let page: Page | undefined;

  // 세션 정보 확인
  const sessionInfo = getSessionInfo();
  console.log("저장된 세션 정보:", sessionInfo);

  try {
    console.log("크롤러 초기화 중...");
    
    // 항상 새로운 인스턴스 생성 (싱글톤 패턴 사용)
    crawler = SoomgoCrawler.getInstance({
      credentials,
      browserOptions: {
        headless: false,
      },
    });

    // 페이지 가져오기
    page = await crawler.getPage();
    
    // 먼저 강제 로그인 시도
    console.log("초기 로그인 시도...");
    const loginSuccess = await crawler.login();
    
    if (loginSuccess) {
      console.log("로그인 성공!");
      saveSessionInfo(true);
    } else {
      console.log("초기 로그인 실패. 계속 진행합니다.");
    }

    // 채팅 페이지로 직접 이동
    console.log("채팅 페이지로 이동 중...");
    await page.goto('https://soomgo.com/pro/chats', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // 현재 URL 확인
    const currentUrl = await page.url();
    console.log("현재 URL:", currentUrl);
    
    // 로그인 페이지로 리다이렉트된 경우 자동 로그인 시도
    if (currentUrl.includes('login')) {
      console.log("로그인 페이지로 리다이렉트됨. 로그인 시도 중...");
      
      console.log("로그인 폼 대기 중...");
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      console.log("이메일 입력:", credentials.email);
      await page.fill('input[type="email"]', credentials.email);
      
      console.log("비밀번호 입력");
      await page.fill('input[type="password"]', credentials.password);
      
      console.log("로그인 버튼 클릭");
      
      // 로그인 버튼 클릭
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 })
      ]);
      
      // 로딩 대기
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');
      
      // 로그인 후 스크린샷 저장
      await page.screenshot({ path: 'manual-login-result.png' });
      
      // 다시 채팅 페이지로 이동
      console.log("다시 채팅 페이지로 이동 중...");
      await page.goto('https://soomgo.com/pro/chats', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    }

    // 페이지 로딩 대기
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 페이지 상태 확인
    console.log("최종 URL:", await page.url());
    console.log("현재 뷰포트 크기:", await page.viewportSize());

    // 간단한 페이지 정보만 가져오기
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyContent: document.body.textContent?.substring(0, 100) + '...'
      };
    });
    
    console.log("\n=== 페이지 기본 정보 ===");
    console.log("제목:", pageInfo.title);
    console.log("URL:", pageInfo.url);
    console.log("본문 일부:", pageInfo.bodyContent);

    // 다시 한번 로그인 상태 확인
    const finalUrl = await page.url();
    if (finalUrl.includes('login')) {
      console.error("로그인에 실패했습니다. 계정 정보를 확인해주세요.");
      await page.screenshot({ path: 'login-failed.png', fullPage: true });
      return;
    }

    // 채팅 아이템 추출
    console.log("\n=== 채팅 아이템 추출 시작 ===");
    const chatItems = await page.$$eval('.chat-item', elements => {
      return elements.map(element => {
        // 기본 정보 추출
        const nameElement = element.querySelector('[class*="user-name"], .prisma-typography.body2\\:semibold');
        const messageElement = element.querySelector('[class*="last-message"], .prisma-typography.body3\\:regular');
        const timeElement = element.querySelector('[class*="time"], .prisma-typography.body4\\:regular.tertiary');
        
        // 링크 정보 추출
        let link = '';
        const anchorElement = element.closest('a');
        if (anchorElement) {
          link = anchorElement.getAttribute('href') || '';
        } else {
          // a 태그로 감싸져 있지 않은 경우 onclick 이벤트 확인
          const onClick = element.getAttribute('onclick') || '';
          const urlMatch = onClick.match(/window\.location\.href\s*=\s*['"](.*?)['"]/);
          if (urlMatch) {
            link = urlMatch[1];
          } else {
            // data-room-id나 data-chat-id가 있다면 이를 이용하여 링크 구성
            const roomId = element.getAttribute('data-room-id') || element.getAttribute('data-chat-id');
            if (roomId) {
              link = `/pro/chats/${roomId}`;
            }
          }
        }
        
        // 신규 메시지 수 추출
        const unreadBadge = element.querySelector('.unread-count-badge, [class*="unread-badge"], [class*="notification-badge"]');
        let unreadCount = 0;
        if (unreadBadge) {
          const badgeText = unreadBadge.textContent?.trim() || '';
          unreadCount = parseInt(badgeText, 10) || 0;
        }
        
        return {
          name: nameElement?.textContent?.trim() || '이름 없음',
          lastMessage: messageElement?.textContent?.trim() || '메시지 없음',
          time: timeElement?.textContent?.trim() || '시간 정보 없음',
          link: link,
          unreadCount: unreadCount
        };
      });
    });
    
    console.log(`채팅 아이템 수: ${chatItems.length}`);
    chatItems.forEach((item, index) => {
      console.log(`\n채팅 ${index + 1}:`);
      console.log(`- 이름: ${item.name}`);
      console.log(`- 마지막 메시지: ${item.lastMessage}`);
      console.log(`- 시간: ${item.time}`);
      console.log(`- 링크: ${item.link}`);
      console.log(`- 읽지 않은 메시지: ${item.unreadCount}개`);
    });

    // 스크린샷 저장
    await page.screenshot({ path: 'chat-page-analysis.png', fullPage: true });
    
    // 페이지 HTML 저장
    const html = await page.content();
    fs.writeFileSync('chat-page.html', html);
    console.log("\nHTML을 chat-page.html 파일로 저장했습니다.");
    
    // 채팅 목록을 데이터베이스에 저장
    console.log("\n채팅 목록을 데이터베이스에 저장합니다...");
    await crawler.getChatList();
    
    console.log("\n분석이 완료되었습니다. 결과를 확인해주세요.");

  } catch (error) {
    console.error("에러 발생:", error);
    if (page) {
      await page.screenshot({ path: 'error-snapshot.png', fullPage: true });
    }
    saveSessionInfo(false);
  } finally {
    console.log("\n테스트가 완료되었습니다. 브라우저를 종료합니다.");
    
    // 테스트 중에만 브라우저를 자동으로 종료
    if (crawler) {
      try {
        // 브라우저 관리자로부터 브라우저 객체를 얻어와 종료
        const browser = await crawler.getBrowser();
        if (browser) {
          await browser.close();
          console.log("브라우저가 정상적으로 종료되었습니다.");
        }
      } catch (closeError) {
        console.error("브라우저 종료 중 오류 발생:", closeError);
      }
    }
  }
}

// 프로세스 종료 시그널 처리
process.on('SIGINT', async () => {
  console.log('\n프로세스 종료 요청 감지. 브라우저를 종료합니다...');
  saveSessionInfo(false);
  try {
    const crawler = SoomgoCrawler.getInstance();
    await crawler.close();
  } catch (e) {
    console.error('브라우저 종료 중 에러:', e);
  }
  process.exit();
});

main(); 