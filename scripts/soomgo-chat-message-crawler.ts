import { chromium, type Browser, type Page } from 'playwright';
import { PrismaClient } from "@prisma/client";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import * as puppeteer from 'puppeteer';

dotenv.config();

// 파일 경로 설정
const COOKIES_PATH = path.join('/tmp', 'soomgo-cookies.json');

// Prisma 클라이언트 초기화
const prisma = new PrismaClient();

// 타입 정의
interface ChatMessage {
  content: string;
  time: Date;
  isMe: boolean;
  sender?: string;
}

interface ChatInfo {
  title: string;
  userName: string | null;
  serviceType: string | null;
  location: string | null;
  price: string | null;
}

class SoomgoChatMessageCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private static instance: SoomgoChatMessageCrawler | null = null;
  private isLoggedIn: boolean = false;
  private cookiesPath = path.join(process.cwd(), 'cookies.json');

  private constructor() {}

  public static getInstance(): SoomgoChatMessageCrawler {
    if (!SoomgoChatMessageCrawler.instance) {
      SoomgoChatMessageCrawler.instance = new SoomgoChatMessageCrawler();
    }
    return SoomgoChatMessageCrawler.instance;
  }

  private async saveCookies() {
    if (!this.page) return;
    const context = this.page.context();
    const cookies = await context.cookies();
    await fs.promises.writeFile(this.cookiesPath, JSON.stringify(cookies));
  }

  private async loadCookies() {
    try {
      if (!this.page) return false;
      if (!fs.existsSync(this.cookiesPath)) return false;
      
      const cookiesString = await fs.promises.readFile(this.cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesString);
      await this.page.context().addCookies(cookies);
      return true;
    } catch (error) {
      console.error('쿠키 로드 중 오류:', error);
      return false;
    }
  }

  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto('https://soomgo.com/requests/received');
      const currentUrl = this.page.url();
      return !currentUrl.includes('login');
    } catch (error) {
      return false;
    }
  }

  async initialize() {
    if (this.browser && this.page) {
      const isStillLoggedIn = await this.checkLoginStatus();
      if (isStillLoggedIn) {
        console.log('기존 세션 재사용 중...');
        return;
      }
    }

    console.log('브라우저 초기화 중...');
    this.browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--window-size=1280,800']
    });
    this.page = await this.browser.newPage();

    await this.page.setViewportSize({ width: 1280, height: 800 });

    const hasCookies = await this.loadCookies();
    if (hasCookies) {
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        console.log('저장된 세션으로 로그인 성공');
        this.isLoggedIn = true;
        return;
      }
    }

    await this.login();
  }

  private async login() {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    if (this.isLoggedIn) return;

    console.log('로그인 시도 중...');
    try {
      console.log('로그인 페이지로 이동...');
      await this.page.goto('https://soomgo.com/login', { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);
      
      console.log('입력 필드 대기 중...');
      const emailInput = await this.page.waitForSelector('input[name="email"]', { timeout: 10000, state: 'visible' });
      const passwordInput = await this.page.waitForSelector('input[name="password"]', { timeout: 10000, state: 'visible' });
      
      if (!emailInput || !passwordInput) {
        throw new Error('로그인 폼을 찾을 수 없습니다.');
      }

      console.log('이메일 입력 중...');
      await emailInput.click();
      await emailInput.fill('');
      await this.page.waitForTimeout(500);
      await emailInput.type(process.env.SOOMGO_EMAIL || '', { delay: 100 });
      
      console.log('비밀번호 입력 중...');
      await passwordInput.click();
      await passwordInput.fill('');
      await this.page.waitForTimeout(500);
      await passwordInput.type(process.env.SOOMGO_PASSWORD || '', { delay: 100 });

      console.log('로그인 버튼 클릭...');
      const submitButton = await this.page.waitForSelector('button[type="submit"]', { state: 'visible' });
      await submitButton?.click();

      console.log('로그인 처리 대기 중...');
      await this.page.waitForTimeout(5000);
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
      
      const currentUrl = this.page.url();
      console.log('현재 URL:', currentUrl);
      
      // 로그인 실패 여부 확인
      const errorElement = await this.page.$('.error-message, .alert-error');
      if (errorElement) {
        const errorText = await errorElement.textContent();
        throw new Error(`로그인 실패: ${errorText}`);
      }
      
      // 로그인 성공 여부 확인 - URL이 /login 페이지가 아니면 성공
      if (currentUrl.includes('/requests/received') || !currentUrl.includes('/login')) {
        console.log('로그인 성공');
        this.isLoggedIn = true;
        await this.saveCookies();
        return true;
      } else {
        console.log('로그인 실패. URL:', currentUrl);
        throw new Error('로그인에 실패했습니다.');
      }
    } catch (error) {
      console.error('로그인 중 오류:', error);
      await this.page.screenshot({ path: 'login-error.png' });
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('브라우저가 종료되었습니다.');
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * 실행 중인 크롬 프로세스 확인 및 정리
   */
  private async checkRunningProcesses(): Promise<number> {
    try {
      const { execSync } = require('child_process');
      
      // 실행 중인 크롬 프로세스 수 확인
      const countCmd = 'ps -ef | grep -i "chrome.*--headless" | grep -v grep | wc -l';
      const count = parseInt(execSync(countCmd).toString().trim(), 10);
      
      if (count > 5) { // 5개 이상의 프로세스가 있으면 정리
        console.log(`${count}개의 크롬 프로세스가 실행 중입니다. 정리를 시도합니다...`);
        const killCmd = 'pkill -f "chrome.*--headless"';
        execSync(killCmd);
        console.log('불필요한 크롬 프로세스를 정리했습니다.');
      }
      
      return count;
    } catch (error) {
      console.error('프로세스 확인/정리 실패:', error);
      return 0;
    }
  }

  /**
   * 특정 채팅방의 메시지 크롤링
   */
  async getChatMessages(chatId: string): Promise<boolean> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    try {
      if (!this.isLoggedIn) {
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('로그인에 실패했습니다.');
        }
      }
      
      // 데이터베이스에서 채팅 정보 조회
      // @ts-ignore - Prisma 타입 문제 무시
      let existingChat = await prisma.chat.findFirst({
        where: { externalId: chatId }
      });
      
      // 채팅이 존재하지 않으면 새로 생성
      if (!existingChat) {
        console.log(`채팅 ID ${chatId}에 대한 정보가 없습니다. 새로 생성합니다.`);
        // @ts-ignore - Prisma 타입 문제 무시
        existingChat = await prisma.chat.create({
          data: {
            externalId: chatId,
            title: '제목 없음',
            lastMessageTime: new Date(),
            hasNewMessage: false,
            unreadCount: 0,
            messageCount: 0
          }
        });
      }
      
      const chatUrl = `https://soomgo.com/pro/chats/${chatId}?from=chatroom`;
      console.log(`채팅방으로 이동 중... URL: ${chatUrl}`);
      await this.page.goto(chatUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      // 페이지 로딩 대기
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000); // 로딩 시간 증가
      
      // 현재 URL 확인
      const currentUrl = this.page.url();
      console.log('현재 URL:', currentUrl);
      
      // 채팅방 정보 추출
      const chatInfo = await this.extractChatInfo();
      console.log('채팅방 정보:', chatInfo);
      
      // 메시지 추출
      const messages = await this.extractChatMessages();
      console.log(`총 ${messages.length}개의 메시지를 추출했습니다.`);
      
      // 스크린샷 저장 (디버깅용)
      await this.page.screenshot({ path: `chat-${chatId}.png`, fullPage: true });
      
      // 채팅 데이터 업데이트
      // @ts-ignore - Prisma 타입 문제 무시
      await prisma.chat.update({
        where: { id: existingChat.id },
        data: {
          title: chatInfo.title || existingChat.title,
          userName: chatInfo.userName,
          serviceType: chatInfo.serviceType,
          location: chatInfo.location,
          price: chatInfo.price,
          hasNewMessage: false,
          unreadCount: 0,
          messageCount: messages.length
        }
      });
      
      // 메시지 저장
      await this.saveMessages(existingChat.id, messages);
      
      console.log(`채팅 ID ${chatId}의 메시지 크롤링이 완료되었습니다.`);
      
      return true;
    } catch (error) {
      console.error('채팅 메시지 크롤링 중 오류 발생:', error);
      
      if (this.page) {
        await this.page.screenshot({ path: 'chat-error.png', fullPage: true });
      }
      
      return false;
    } finally {
      // 브라우저 종료
      await this.close();
    }
  }

  /**
   * 채팅방 정보 추출
   */
  private async extractChatInfo(): Promise<ChatInfo> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    return await this.page.evaluate(() => {
      // 제목 추출 (요청 제목)
      const titleElement = document.querySelector('.chat-room-header h1, .request-title, [class*="request-title"], .chat-room-title');
      const title = titleElement?.textContent?.trim() || '제목 없음';
      
      // 사용자 이름 추출
      const userNameElement = document.querySelector('.chat-room-header .user-name, .profile-name, [class*="user-name"]');
      const userName = userNameElement?.textContent?.trim() || null;
      
      // 서비스 유형 추출
      const serviceTypeElement = document.querySelector('.service-type, [class*="service-type"], .category-name');
      const serviceType = serviceTypeElement?.textContent?.trim() || null;
      
      // 위치 정보 추출
      const locationElement = document.querySelector('.location, [class*="location"], .region');
      const location = locationElement?.textContent?.trim() || null;
      
      // 가격 정보 추출 (견적 가격)
      const priceElement = document.querySelector('.price, [class*="price"], .quote-price, .estimate-price');
      const price = priceElement?.textContent?.trim() || null;
      
      return {
        title,
        userName,
        serviceType,
        location,
        price
      };
    });
  }

  /**
   * 채팅 메시지 추출
   */
  private async extractChatMessages(): Promise<ChatMessage[]> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    return await this.page.evaluate(() => {
      const messageElements = document.querySelectorAll('.chat-message, .message-item, [class*="message-bubble"], [class*="message-wrap"]');
      const messages: any[] = [];
      
      messageElements.forEach(element => {
        // 나의 메시지인지 확인 (일반적으로 CSS 클래스로 구분)
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
        let time: any;
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
            // 클라이언트 측에서는 Date 객체를 직렬화할 수 없으므로 문자열로 변환
            const dateStr = timeStr.replace(/년|월/g, '-').replace(/일/g, '');
            time = new Date(dateStr).toISOString();
          } else {
            // 기타 형식은 현재 시간으로
            time = new Date().toISOString();
          }
        } else {
          time = new Date().toISOString();
        }
        
        // 발신자 정보 (선택적)
        const senderElement = element.querySelector('.sender-name, [class*="sender"]');
        const sender = senderElement?.textContent?.trim();
        
        messages.push({
          content,
          time,
          isMe,
          sender
        });
      });
      
      return messages;
    });
  }

  /**
   * 메시지를 데이터베이스에 저장
   */
  private async saveMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    try {
      console.log(`채팅 ID ${chatId}에 ${messages.length}개의 메시지 저장 시도 중...`);
      
      // 이미 저장된 메시지를 확인
      // @ts-ignore - Prisma 타입 문제 무시
      const existingMessages = await prisma.message.findMany({
        where: { chatId },
        select: { content: true, time: true, isMe: true }
      });
      
      console.log(`기존 메시지 ${existingMessages.length}개가 이미 저장되어 있습니다.`);
      
      // 새 메시지만 필터링 (내용과 시간이 정확히 일치하는 경우만 중복으로 처리)
      const newMessages = messages.filter(newMsg => {
        return !existingMessages.some(existingMsg => 
          existingMsg.content === newMsg.content && 
          existingMsg.time.getTime() === new Date(newMsg.time).getTime() &&
          existingMsg.isMe === newMsg.isMe
        );
      });
      
      console.log(`새로운 메시지 ${newMessages.length}개를 저장합니다.`);
      
      if (newMessages.length === 0) {
        console.log('저장할 새 메시지가 없습니다.');
        return;
      }
      
      // 새 메시지 저장
      await prisma.$transaction(
        newMessages.map(msg => 
          // @ts-ignore - Prisma 타입 문제 무시
          prisma.message.create({
            data: {
              chatId,
              content: msg.content,
              time: new Date(msg.time),
              isMe: msg.isMe,
            },
          })
        )
      );
      
      console.log(`${newMessages.length}개의 메시지가 저장되었습니다.`);
    } catch (error) {
      console.error('메시지 저장 중 오류 발생:', error);
      throw error;
    }
  }
}

/**
 * 채팅 목록에서 모든 채팅방의 메시지를 크롤링
 */
async function crawlAllChatMessages(): Promise<void> {
  const crawler = new SoomgoChatMessageCrawler();
  
  try {
    await crawler.initialize();
    
    // 데이터베이스에서 모든 채팅 목록 가져오기
    // @ts-ignore - Prisma 타입 문제 무시
    const chats = await prisma.chat.findMany({
      orderBy: {
        lastMessageTime: 'desc'
      }
    });
    
    console.log(`총 ${chats.length}개의 채팅방이 있습니다.`);
    
    // 각 채팅방의 메시지 크롤링
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      // externalId가 null이 아닌지 확인
      if (!chat.externalId) {
        console.log(`[${i+1}/${chats.length}] 채팅 ID: ${chat.id}의 externalId가 없어 건너뜁니다.`);
        continue;
      }
      
      console.log(`[${i+1}/${chats.length}] 채팅 ID: ${chat.externalId} 메시지 크롤링 중...`);
      
      await crawler.getChatMessages(chat.externalId);
      
      // 다음 요청 전에 짧은 대기 시간 추가 (서버에 부하 방지)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('모든 채팅방 메시지 크롤링이 완료되었습니다.');
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
  } finally {
    await crawler.close();
  }
}

/**
 * 특정 채팅방의 메시지만 크롤링
 */
async function crawlSingleChatMessage(chatId: string): Promise<void> {
  const crawler = SoomgoChatMessageCrawler.getInstance();
  
  try {
    const success = await crawler.getChatMessages(chatId);
    
    if (success) {
      console.log(`채팅 ID ${chatId}의 메시지 크롤링이 완료되었습니다.`);
    } else {
      console.error(`채팅 ID ${chatId}의 메시지 크롤링에 실패했습니다.`);
    }
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
  } finally {
    await crawler.close();
  }
}

// 프로세스 종료 시그널 처리
process.on('SIGINT', async () => {
  console.log('\n프로세스 종료 요청 감지. 브라우저를 종료합니다...');
  try {
    const crawler = new SoomgoChatMessageCrawler();
    await crawler.close();
  } catch (e) {
    console.error('브라우저 종료 중 에러:', e);
  }
  process.exit();
});

// 메인 실행 코드
async function main() {
  const chatId = process.argv[2];
  if (!chatId) {
    console.error('채팅 ID를 입력해주세요.');
    process.exit(1);
  }

  console.log(`채팅 ID ${chatId}의 메시지를 크롤링합니다...`);
  
  try {
    const crawler = SoomgoChatMessageCrawler.getInstance();
    await crawler.initialize();
    await crawlSingleChatMessage(chatId);
  } catch (error) {
    console.error(`채팅 ID ${chatId}의 메시지 크롤링에 실패했습니다.`);
    console.error(error);
  }
}

// 스크립트 실행
main(); 