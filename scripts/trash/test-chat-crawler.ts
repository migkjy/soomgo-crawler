const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config();

// Prisma 클라이언트 초기화
const prisma = new PrismaClient();

// 파일 경로 설정
const COOKIES_PATH = path.join(process.cwd(), 'soomgo-cookies.json');

async function crawlChatMessages(chatId) {
  if (!chatId) {
    console.error('크롤링할 채팅 ID를 입력하세요.');
    process.exit(1);
  }

  console.log(`채팅 ID: ${chatId} 메시지 크롤링을 시작합니다...`);

  // 기존 브라우저 인스턴스가 여러 개 실행되지 않도록 기존 쿠키 파일 삭제
  if (fs.existsSync(COOKIES_PATH)) {
    console.log("기존 쿠키 파일 삭제");
    fs.unlinkSync(COOKIES_PATH);
  }

  const credentials = {
    email: process.env.SOOMGO_EMAIL,
    password: process.env.SOOMGO_PASSWORD,
  };

  // 자격 증명 확인
  if (!credentials.email || !credentials.password) {
    console.error("환경 변수에 SOOMGO_EMAIL 또는 SOOMGO_PASSWORD가 설정되지 않았습니다.");
    process.exit(1);
  }

  let browser;
  let page;

  try {
    console.log("브라우저 초기화 중...");
    browser = await chromium.launch({
      headless: false,
    });
    
    page = await browser.newPage();
    
    // 로그인
    console.log("로그인 시도 중...");
    await page.goto('https://soomgo.com/login', { waitUntil: 'networkidle' });
    
    // 로그인 페이지인지 확인
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      console.log("로그인 페이지에서 로그인 시도 중...");
      
      await page.fill('input[type="email"]', credentials.email);
      await page.fill('input[type="password"]', credentials.password);
      
      // 로그인 버튼 클릭 및 페이지 로드 대기
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle' })
      ]);
      
      // 로그인 후 쿠키 저장
      const cookies = await page.context().cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
      console.log("쿠키가 저장되었습니다.");
    } else {
      console.log("이미 로그인되어 있습니다.");
    }
    
    // 채팅방으로 이동
    const chatUrl = `https://soomgo.com/pro/chats/${chatId}`;
    console.log(`채팅방으로 이동 중... URL: ${chatUrl}`);
    await page.goto(chatUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 페이지 로딩 대기
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // 스크린샷 저장
    await page.screenshot({ path: `chat-${chatId}.png`, fullPage: true });
    
    // 채팅방 정보 추출
    const chatInfo = await page.evaluate(() => {
      // 제목 추출
      const titleElement = document.querySelector('.chat-room-header h3, .request-title, [class*="request-title"]');
      const title = titleElement?.textContent?.trim() || '제목 없음';
      
      // 사용자 이름 추출
      const userNameElement = document.querySelector('.user-name, [class*="user-name"], .profile-name');
      const userName = userNameElement?.textContent?.trim() || null;
      
      // 서비스 유형 추출
      const serviceTypeElement = document.querySelector('.service-type, [class*="service-type"]');
      const serviceType = serviceTypeElement?.textContent?.trim() || null;
      
      // 위치 정보 추출
      const locationElement = document.querySelector('.location, [class*="location"]');
      const location = locationElement?.textContent?.trim() || null;
      
      // 가격 정보 추출
      const priceElement = document.querySelector('.price, [class*="price"], .quote-price');
      const price = priceElement?.textContent?.trim() || null;
      
      return {
        title,
        userName,
        serviceType,
        location,
        price
      };
    });
    
    console.log("채팅방 정보:", chatInfo);
    
    // 메시지 추출
    const messages = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('.chat-message, .message-item, [class*="message-bubble"], [class*="message-wrap"]');
      const messages = [];
      
      messageElements.forEach(element => {
        // 나의 메시지인지 확인 (CSS 클래스로 구분)
        const isMe = element.classList.contains('my-message') || 
                    element.classList.contains('is-me') || 
                    element.closest('.message-right, .my-message, [class*="my-message"]') !== null;
        
        // 메시지 내용 추출
        const contentElement = element.querySelector('.message-content, .bubble-content, [class*="content"], .text');
        const content = contentElement?.textContent?.trim() || '';
        
        // 빈 메시지는 건너뛰기
        if (!content) return;
        
        // 시간 정보 추출
        const timeElement = element.querySelector('.time, .message-time, [class*="time"]');
        let timeStr = timeElement?.textContent?.trim() || '';
        
        // 시간 정보 파싱
        let time;
        if (timeStr) {
          // 다양한 시간 포맷 처리
          if (timeStr.includes(':')) {
            // HH:MM 형식인 경우 오늘 날짜에 시간 추가
            const today = new Date();
            const [hours, minutes] = timeStr.split(':').map(Number);
            today.setHours(hours, minutes, 0, 0);
            time = today.toISOString();
          } else if (timeStr.includes('년') || timeStr.includes('월')) {
            // 한국어 날짜 형식 (2023년 5월 25일 등)
            const dateStr = timeStr.replace(/년|월/g, '-').replace(/일/g, '');
            time = new Date(dateStr).toISOString();
          } else {
            // 기타 형식은 현재 시간으로
            time = new Date().toISOString();
          }
        } else {
          time = new Date().toISOString();
        }
        
        messages.push({
          content,
          time,
          isMe
        });
      });
      
      return messages;
    });
    
    console.log(`총 ${messages.length}개의 메시지를 추출했습니다.`);
    messages.forEach((msg, idx) => {
      console.log(`[${idx+1}] ${msg.isMe ? '나' : '상대방'}: ${msg.content.substring(0, 30)}${msg.content.length > 30 ? '...' : ''}`);
    });
    
    // 메시지 저장 처리 (기존 chat-test.ts의 함수를 활용)
    // 먼저 채팅이 DB에 있는지 확인
    // @ts-ignore - Prisma 타입 문제 무시
    const chatData = await prisma.chat.findFirst({
      where: { externalId: chatId }
    });
    
    if (!chatData) {
      console.log("해당 채팅이 데이터베이스에 존재하지 않습니다. 먼저 채팅 목록을 크롤링해주세요.");
    } else {
      // 메시지 저장
      console.log(`채팅 ID ${chatData.id}에 메시지 저장 중...`);
      
      // 기존 메시지 확인
      // @ts-ignore - Prisma 타입 문제 무시
      const existingMessages = await prisma.message.findMany({
        where: { chatId: chatData.id },
        select: { content: true, time: true, isMe: true }
      });
      
      // 새 메시지만 필터링
      const newMessages = messages.filter(newMsg => {
        // 이미 동일한 내용과 시간의 메시지가 있는지 확인
        return !existingMessages.some(existingMsg => 
          existingMsg.content === newMsg.content && 
          existingMsg.isMe === newMsg.isMe
        );
      });
      
      console.log(`전체 메시지 ${messages.length}개 중 ${newMessages.length}개의 새 메시지 저장`);
      
      if (newMessages.length > 0) {
        // 새 메시지 저장
        for (const msg of newMessages) {
          // @ts-ignore - Prisma 타입 문제 무시
          await prisma.message.create({
            data: {
              chatId: chatData.id,
              content: msg.content,
              time: new Date(msg.time),
              isMe: msg.isMe,
            },
          });
        }
        console.log(`${newMessages.length}개의 메시지가 저장되었습니다.`);
      } else {
        console.log("저장할 새 메시지가 없습니다.");
      }
    }
    
    console.log("크롤링이 완료되었습니다.");
    
  } catch (error) {
    console.error("에러 발생:", error);
    if (page) {
      await page.screenshot({ path: 'error-snapshot.png', fullPage: true });
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log("브라우저가 종료되었습니다.");
    }
  }
}

// 프로세스 종료 시그널 처리
process.on('SIGINT', async () => {
  console.log('\n프로세스 종료 요청 감지. 종료합니다...');
  process.exit();
});

// 메인 함수 실행
const chatId = process.argv[2]; // 커맨드 라인 인자로 채팅 ID 받기
crawlChatMessages(chatId); 