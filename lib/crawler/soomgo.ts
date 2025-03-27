import { chromium, type Browser, type Page, BrowserContext } from 'playwright';
import { env } from '@/env.mjs';
import { upsertChatTest, upsertMessagesTest } from "@/scripts/chat-test";
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { setCrawlingStatus } from '@/app/api/soomgo/chats/[id]/crawl-status/route';

dotenv.config();

const prisma = new PrismaClient();

interface ChatItem {
  id: string;
  title: string;
  userName: string;
  serviceType: string;
  location: string;
  lastMessage: string;
  lastMessageTime: string;
  hasNewMessage: boolean;
  unreadCount: number | null;
  price: string | null;
  link: string;
}

interface ChatMessage {
  content: string;
  time: string;
  isMe: boolean;
  messageType?: 'CUSTOMER' | 'PRO' | 'SOOMGO';
  sender?: string | undefined;
}

interface ChatInfo {
  title: string;
  userName: string | undefined;
  serviceType: string | undefined;
  location: string | undefined;
  price: string | undefined;
}

interface ChatUpdateData {
  title: string;
  hasNewMessage: boolean;
  unreadCount: number;
  messageCount: number;
  userName?: string;
  serviceType?: string;
  location?: string;
  price?: string;
}

export interface SoomgoCredentials {
  email: string;
  password: string;
}

export interface SoomgoCrawlerOptions {
  credentials: SoomgoCredentials;
  browserOptions?: {
    headless?: boolean;
  };
}

// 쿠키 저장 경로
const COOKIES_PATH = path.join('/tmp', 'soomgo-cookies.json');

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log("새 브라우저 인스턴스 생성 중...");
      this.browser = await chromium.launch({
        headless: false
      });
    } else {
      console.log("기존 브라우저 인스턴스 재사용 중...");
    }
    return this.browser;
  }

  public async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      const browser = await this.getBrowser();
      console.log("새 브라우저 컨텍스트 생성 중...");
      this.context = await browser.newContext();
      
      // 저장된 쿠키가 있으면 로드
      if (fs.existsSync(COOKIES_PATH)) {
        console.log("저장된 쿠키 로드 중...");
        try {
          const cookiesString = fs.readFileSync(COOKIES_PATH, 'utf8');
          const cookies = JSON.parse(cookiesString);
          await this.context.addCookies(cookies);
          console.log("쿠키 로드 완료");
        } catch (error) {
          console.error("쿠키 로드 실패:", error);
        }
      }
    } else {
      console.log("기존 브라우저 컨텍스트 재사용 중...");
    }
    return this.context;
  }

  public async getPage(): Promise<Page> {
    if (!this.page) {
      console.log("새 페이지 생성 중...");
      const context = await this.getContext();
      this.page = await context.newPage();
      
      // 페이지 설정
      await this.page.setViewportSize({ width: 1280, height: 800 });
    } else {
      console.log("기존 페이지 재사용 중...");
    }
    return this.page;
  }
  
  public async saveCookies(): Promise<void> {
    if (!this.context) {
      console.log("쿠키를 저장할 컨텍스트가 없습니다.");
      return;
    }
    
    try {
      const cookies = await this.context.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      console.log("쿠키 저장 완료");
    } catch (error) {
      console.error("쿠키 저장 실패:", error);
    }
  }

  public isRunning(): boolean {
    return this.browser !== null && this.page !== null;
  }

  public async close() {
    if (this.page) {
      console.log("페이지 종료 중...");
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      console.log("컨텍스트 종료 중...");
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      console.log("브라우저 종료 중...");
      await this.browser.close();
      this.browser = null;
    }
  }
}

export class SoomgoCrawler {
  private static instance: SoomgoCrawler | null = null;
  private browserManager: BrowserManager;
  private page: Page | null = null;
  private isLoggedInState = false;
  private credentials: SoomgoCredentials;
  private browserOptions: { headless?: boolean };

  private constructor(config: SoomgoCrawlerOptions) {
    this.browserManager = BrowserManager.getInstance();
    this.credentials = config.credentials;
    this.browserOptions = config.browserOptions || {};
  }

  public static getInstance(config?: SoomgoCrawlerOptions): SoomgoCrawler {
    if (!SoomgoCrawler.instance && config) {
      console.log("새 SoomgoCrawler 인스턴스 생성 중...");
      SoomgoCrawler.instance = new SoomgoCrawler(config);
    } else if (SoomgoCrawler.instance) {
      console.log("기존 SoomgoCrawler 인스턴스 재사용 중...");
      // 이미 인스턴스가 있지만 새 설정이 제공된 경우 인증 정보 업데이트
      if (config) {
        SoomgoCrawler.instance.credentials = config.credentials;
        SoomgoCrawler.instance.browserOptions = config.browserOptions || {};
      }
    }
    
    if (!SoomgoCrawler.instance) {
      throw new Error('크롤러가 초기화되지 않았습니다.');
    }
    return SoomgoCrawler.instance;
  }

  public isLoggedIn(): boolean {
    return this.isLoggedInState;
  }

  /**
   * 현재 브라우저 인스턴스를 반환합니다.
   * @returns Browser 인스턴스
   */
  public async getBrowser(): Promise<Browser> {
    return this.browserManager.getBrowser();
  }

  public async checkLoginStatus(): Promise<boolean> {
    if (!this.page) {
      this.page = await this.getPage();
    }
    
    try {
      // 현재 URL 확인
      const currentUrl = await this.page.url();
      console.log("로그인 상태 확인 중: 현재 URL:", currentUrl);
      
      // 로그인이 필요한 URL인지 확인
      if (currentUrl.includes('login')) {
        console.log("현재 로그인 페이지에 있습니다. 로그인 필요");
        this.isLoggedInState = false;
        return false;
      }

      // 로그아웃 링크가 있는지 확인 (가장 신뢰할 수 있는 방법)
      const hasLogoutLink = await this.page.evaluate(() => {
        // URL이 /logout을 포함한 링크 찾기
        const logoutLinks = Array.from(document.querySelectorAll('a'))
          .filter(a => a.href.includes('/logout'));
        
        // 텍스트에 '로그아웃'을 포함한 요소 찾기
        const logoutTexts = Array.from(document.querySelectorAll('a, button, div, span'))
          .filter(el => el.textContent?.includes('로그아웃'));
        
        return {
          hasLogoutLink: logoutLinks.length > 0,
          hasLogoutText: logoutTexts.length > 0,
          logoutLinkCount: logoutLinks.length,
          logoutTextCount: logoutTexts.length
        };
      });

      console.log("로그아웃 링크 확인 결과:", hasLogoutLink);
      
      // 프로필 정보가 있는지 확인
      const hasProfileInfo = await this.page.evaluate(() => {
        const profileElements = document.querySelectorAll('.profile, .avatar, .user-menu, .user-profile');
        return profileElements.length > 0;
      });
      
      console.log("프로필 정보 확인 결과:", hasProfileInfo);
      
      // 접속된 URL이 제한된 페이지인지 확인
      const isRestrictedPage = !currentUrl.includes('login') && 
        (currentUrl.includes('/pro/') || 
         currentUrl.includes('/requests/') || 
         currentUrl.includes('/dashboard') ||
         currentUrl.includes('/account'));
      
      // 로그인 상태 결정
      const isLoggedIn = (hasLogoutLink.hasLogoutLink || hasLogoutLink.hasLogoutText || hasProfileInfo || isRestrictedPage);
      
      this.isLoggedInState = isLoggedIn;
      console.log("최종 로그인 상태 확인:", this.isLoggedInState ? "로그인됨" : "로그인 안됨");
      
      // 로그인 확인 후 쿠키 저장
      if (isLoggedIn) {
        await this.browserManager.saveCookies();
      }
      
      return this.isLoggedInState;
    } catch (error) {
      console.error("로그인 상태 확인 중 오류:", error);
      return false;
    }
  }

  public async getPage(): Promise<Page> {
    if (!this.page) {
      this.page = await this.browserManager.getPage();
    }
    return this.page;
  }

  public async login(): Promise<boolean> {
    // 이미 로그인되어 있는지 확인
    const isAlreadyLoggedIn = await this.checkLoginStatus();
    if (isAlreadyLoggedIn) {
      console.log('이미 로그인되어 있습니다.');
      return true;
    }

    const page = await this.getPage();
    
    try {
      console.log('로그인 페이지로 이동 중...');
      await page.goto('https://soomgo.com/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // 현재 URL이 로그인 페이지인지 확인
      const currentUrl = await page.url();
      if (!currentUrl.includes('login')) {
        console.log('이미 로그인된 상태입니다. 현재 URL:', currentUrl);
        this.isLoggedInState = true;
        return true;
      }
      
      console.log('로그인 폼 대기 중...');
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      console.log('이메일 입력:', this.credentials.email);
      await page.fill('input[type="email"]', this.credentials.email);
      
      console.log('비밀번호 입력');
      await page.fill('input[type="password"]', this.credentials.password);
      
      // 캡처하여 로그인 페이지 상태 확인
      await page.screenshot({ path: 'before-login.png' });
      
      console.log('로그인 버튼 클릭');
      
      // 로그인 버튼이 여러 개일 수 있으므로 정확한 선택자를 찾아 클릭
      const buttonSelector = 'button[type="submit"]';
      await page.waitForSelector(buttonSelector, { timeout: 5000 });
      
      // 클릭 전에 스크린샷 저장
      await page.screenshot({ path: 'before-login-click.png' });
      
      // 클릭과 네비게이션을 병렬로 처리
      await Promise.all([
        page.click(buttonSelector),
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 })
      ]).catch(e => {
        console.log('로그인 버튼 클릭 중 오류 발생:', e.message);
      });
      
      // 로딩 대기
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');
      
      // 로그인 후 스크린샷 저장
      await page.screenshot({ path: 'after-login.png' });
      
      // 로그인 후 URL 확인
      const afterLoginUrl = await page.url();
      console.log('로그인 후 URL:', afterLoginUrl);
      
      // 특정 페이지로 리다이렉트된 경우
      if (afterLoginUrl.includes('redirect=')) {
        console.log('리다이렉트 URL 감지. 원래 페이지로 이동 중...');
        const redirectMatch = afterLoginUrl.match(/redirect=([^&]+)/);
        if (redirectMatch && redirectMatch[1]) {
          const decodedRedirect = decodeURIComponent(redirectMatch[1]);
          console.log('리다이렉트 대상:', decodedRedirect);
          await page.goto(`https://soomgo.com${decodedRedirect}`, {
            waitUntil: 'networkidle',
            timeout: 30000
          });
        }
      }
      
      // 쿠키 저장
      await this.browserManager.saveCookies();
      
      // 로그인 상태 다시 확인
      const loginSuccess = await this.checkLoginStatus();
      if (!loginSuccess) {
        console.log('로그인 실패: 로그인 상태가 확인되지 않습니다.');
        await page.screenshot({ path: 'login-failed.png' });
        return false;
      }
      
      console.log('로그인 성공');
      return true;
    } catch (error) {
      console.error('로그인 시도 중 오류 발생:', error);
      await page.screenshot({ path: 'login-error.png' });
      return false;
    }
  }

  async getChatList() {
    try {
      // 로그인 상태 확인 및 필요시 로그인
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        console.log('로그인이 필요합니다. 로그인 시도 중...');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          console.log('로그인 실패. 채팅 목록을 가져올 수 없습니다.');
          return [];
        }
      }

      if (!this.page) {
        await this.getPage();
        if (!this.page) {
          throw new Error('페이지 초기화 실패');
        }
      }

      console.log('채팅 페이지로 이동 중...');
      await this.page.goto('https://soomgo.com/pro/chats', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // 페이지 로딩 대기 및 현재 URL 확인
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(3000);
      
      const currentUrl = await this.page.url();
      console.log('현재 페이지 URL:', currentUrl);
      
      // 로그인 페이지로 리다이렉트 됐는지 확인
      if (currentUrl.includes('login')) {
        console.log('로그인 페이지로 리다이렉트 되었습니다. 다시 로그인 시도 중...');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          console.log('재로그인 실패. 채팅 목록을 가져올 수 없습니다.');
          return [];
        }
        
        // 로그인 후 다시 채팅 페이지로 이동
        await this.page.goto('https://soomgo.com/pro/chats', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000);
      }
      
      // 스크린샷 저장
      await this.page.screenshot({ path: 'chat-list-page.png', fullPage: true });
      
      console.log('채팅 목록 요소 찾는 중...');
      const chatItems = await this.page.$$eval('.chat-item, .chat-room-item, [class*="chat"][class*="item"]', (items) => {
        return items.map(item => {
          const htmlItem = item as HTMLElement;
          
          // 기본 정보 추출
          const userNameElement = htmlItem.querySelector('[class*="user-name"], .prisma-typography.body2\\:semibold');
          const userName = userNameElement?.textContent?.trim() || '';
          
          const serviceInfoElement = htmlItem.querySelector('[class*="service-info"], .prisma-typography.body4\\:regular.primary');
          const serviceInfo = serviceInfoElement?.textContent?.trim() || '';
          
          const lastMessageElement = htmlItem.querySelector('[class*="last-message"], .prisma-typography.body3\\:regular');
          const lastMessage = lastMessageElement?.textContent?.trim() || '';
          
          const timeElement = htmlItem.querySelector('[class*="time"], .prisma-typography.body4\\:regular.tertiary');
          const lastMessageTime = timeElement?.textContent?.trim() || '';
          
          // 읽지 않은 메시지 수 추출
          const unreadCountElement = htmlItem.querySelector('.unread-count-badge, [class*="unread"], [class*="notification-badge"]');
          const unreadCount = unreadCountElement ? 
            parseInt(unreadCountElement.textContent?.trim() || '0', 10) : 
            null;
          
          const priceElement = htmlItem.querySelector('[class*="price"], .prisma-typography.body3\\:semibold.primary');
          const price = priceElement?.textContent?.trim() || '';
          
          // 채팅 ID와 링크 추출
          const chatId = htmlItem.getAttribute('data-room-id') || 
                        htmlItem.getAttribute('data-chat-id') || 
                        htmlItem.getAttribute('id') || '';
          
          // 링크 정보 추출
          let chatLink = '';
          const anchorElement = htmlItem.closest('a');
          if (anchorElement) {
            chatLink = anchorElement.getAttribute('href') || '';
          } else {
            // a 태그로 감싸져 있지 않은 경우 onclick 이벤트 확인
            const onClick = htmlItem.getAttribute('onclick') || '';
            const urlMatch = onClick.match(/window\.location\.href\s*=\s*['"](.*?)['"]/);
            if (urlMatch) {
              chatLink = urlMatch[1];
            } else if (chatId) {
              chatLink = `/pro/chats/${chatId}`;
            }
          }
          
          // 링크에서 ID 추출 (우선순위: URL에서 추출 > data-room-id 속성)
          let extractedId = chatId;
          if (chatLink) {
            // /pro/chats/165563062?from=chatroom 형식에서 숫자 ID 추출
            const linkIdMatch = chatLink.match(/\/pro\/chats\/(\d+)/);
            if (linkIdMatch && linkIdMatch[1]) {
              extractedId = linkIdMatch[1];
            }
          }
          
          // 제목 파싱하여 사용자 이름, 서비스 유형, 위치 정보 분리
          const title = `${userName} ${serviceInfo}`;
          let parsedUserName = '';
          let serviceType = '';
          let location = '';
          
          // '홍길동 웹 개발 ∙ 서울 강남구' 형식 분리
          if (title.includes('∙')) {
            const parts = title.split('∙');
            if (parts.length >= 2) {
              const beforeDot = parts[0].trim();
              location = parts[1].trim();
              
              // 사용자 이름과 서비스 타입 분리
              // 이름은 보통 2-3자이므로 첫 3단어까지를 이름으로 간주
              const nameServiceParts = beforeDot.split(' ');
              if (nameServiceParts.length >= 2) {
                // 첫 번째 단어는 항상 이름으로 간주
                parsedUserName = nameServiceParts[0];
                
                // 나머지는 서비스 타입으로 간주
                serviceType = nameServiceParts.slice(1).join(' ');
              } else {
                parsedUserName = beforeDot;
              }
            } else {
              parsedUserName = title;
            }
          } else {
            parsedUserName = title;
          }
          
          return {
            id: extractedId,
            title: title,
            userName: parsedUserName,
            serviceType: serviceType,
            location: location,
            lastMessage,
            lastMessageTime,
            hasNewMessage: unreadCount !== null && unreadCount > 0,
            unreadCount,
            price,
            link: chatLink
          };
        }).filter(chat => chat.id !== '' || chat.link !== '');
      });
      
      console.log('찾은 채팅 수:', chatItems.length);
      
      chatItems.forEach((chat, index) => {
        console.log(`\n채팅 ${index + 1}:`);
        console.log(`- 제목: ${chat.title}`);
        console.log(`- 사용자 이름: ${chat.userName}`);
        console.log(`- 서비스 유형: ${chat.serviceType}`);
        console.log(`- 위치: ${chat.location}`);
        console.log(`- 마지막 메시지: ${chat.lastMessage}`);
        console.log(`- 시간: ${chat.lastMessageTime}`);
        console.log(`- 읽지 않은 메시지: ${chat.unreadCount || 0}개`);
        console.log(`- 링크: ${chat.link}`);
      });
      
      if (chatItems.length > 0) {
        console.log('채팅 데이터 DB 저장 중...');
        for (const chat of chatItems) {
          // ID가 없으면 링크에서 추출 시도
          if (!chat.id && chat.link) {
            const linkIdMatch = chat.link.match(/\/pro\/chats\/(\d+)/);
            if (linkIdMatch && linkIdMatch[1]) {
              chat.id = linkIdMatch[1];
              console.log(`링크에서 ID 추출: ${chat.id}`);
            }
          }
          
          // 여전히 ID가 없으면 저장하지 않음
          if (!chat.id) {
            console.log('채팅 ID가 없어 저장을 건너뜁니다:', chat);
            continue;
          }
          
          console.log('저장 중인 채팅:', chat);
          
          // 먼저 externalId로 기존 채팅이 있는지 확인
          try {
            // 1. externalId로 기존 채팅이 있는지 먼저 확인
            const existingByExternalId = await prisma.chat.findUnique({
              where: { externalId: chat.id }
            });
            
            if (existingByExternalId) {
              console.log(`externalId ${chat.id}로 이미 채팅이 존재합니다. ID: ${existingByExternalId.id}`);
              
              // 기존 채팅 업데이트
              await prisma.chat.update({
                where: { id: existingByExternalId.id },
                data: {
                  title: chat.title,
                  userName: chat.userName || null,
                  serviceType: chat.serviceType || null,
                  location: chat.location || null,
                  lastMessage: chat.lastMessage,
                  lastMessageTime: chat.lastMessageTime ? parseSafeDate(chat.lastMessageTime) : new Date(),
                  hasNewMessage: chat.hasNewMessage || false,
                  unreadCount: chat.unreadCount || 0,
                  price: chat.price,
                  link: chat.link,
                  // 상태는 기존 값 유지
                }
              });
              
              console.log(`기존 채팅 업데이트 완료: ${existingByExternalId.id}`);
              continue; // 다음 채팅으로 바로 넘어감
            }
            
            // 2. id로 채팅 정보 조회
            const existingChat = await prisma.chat.findFirst({
              where: { id: chat.id },
              select: {
                id: true,
                externalId: true,
                title: true,
                hasNewMessage: true,
                unreadCount: true,
                status: true
              }
            });
            
            // 채팅 정보가 없는 경우 새로 생성
            if (!existingChat) {
              console.log(`채팅 ID ${chat.id}에 대한 정보가 없습니다. 새로 생성합니다.`);
              
              // 새 채팅 생성
              const createdChat = await prisma.chat.create({
                data: {
                  externalId: chat.id,
                  title: chat.title,
                  userName: chat.userName || null,
                  serviceType: chat.serviceType || null,
                  location: chat.location || null,
                  lastMessage: chat.lastMessage,
                  lastMessageTime: chat.lastMessageTime ? parseSafeDate(chat.lastMessageTime) : new Date(),
                  hasNewMessage: chat.hasNewMessage || false,
                  unreadCount: chat.unreadCount || 0,
                  price: chat.price,
                  link: chat.link,
                  status: 'NEW' // 기본 상태
                }
              });
              
              console.log(`새 채팅 생성 성공: ${createdChat.id}, externalId: ${createdChat.externalId}`);
              continue; // 다음 채팅으로 넘어감
            }

            // 기존 채팅 정보가 있지만 externalId가 없는 경우
            if (existingChat && !existingChat.externalId) {
              console.log(`채팅 ID ${chat.id}의 externalId가 없습니다. 업데이트합니다.`);
              
              // externalId 업데이트
              await prisma.chat.update({
                where: { id: existingChat.id },
                data: {
                  externalId: chat.id,
                  title: chat.title,
                  userName: chat.userName || null,
                  serviceType: chat.serviceType || null,
                  location: chat.location || null,
                  lastMessage: chat.lastMessage,
                  lastMessageTime: chat.lastMessageTime ? parseSafeDate(chat.lastMessageTime) : new Date(),
                  hasNewMessage: chat.hasNewMessage || false,
                  unreadCount: chat.unreadCount || 0,
                  price: chat.price,
                  link: chat.link,
                }
              });
              
              console.log(`채팅 externalId 업데이트 성공: ${existingChat.id}, externalId: ${chat.id}`);
              continue; // 다음 채팅으로 넘어감
            }

            // 기존 채팅 정보가 있고 externalId도 있지만 다른 경우
            if (existingChat && existingChat.externalId && existingChat.externalId !== chat.id) {
              console.log(`채팅 ID ${chat.id}의 externalId(${existingChat.externalId})가 새 값(${chat.id})과 다릅니다.`);
              
              // 안전하게 처리하기 위해 새 ID로 생성
              const randomId = `chat_${Date.now()}_${Math.round(Math.random() * 1000)}`;
              const createdChat = await prisma.chat.create({
                data: {
                  id: randomId, // 새로운 ID 생성
                  externalId: chat.id,
                  title: chat.title,
                  userName: chat.userName || null,
                  serviceType: chat.serviceType || null,
                  location: chat.location || null,
                  lastMessage: chat.lastMessage,
                  lastMessageTime: chat.lastMessageTime ? parseSafeDate(chat.lastMessageTime) : new Date(),
                  hasNewMessage: chat.hasNewMessage || false,
                  unreadCount: chat.unreadCount || 0,
                  price: chat.price,
                  link: chat.link,
                  status: 'NEW' // 기본 상태
                }
              });
              
              console.log(`새 ID로 채팅 생성 성공: ${createdChat.id}, externalId: ${createdChat.externalId}`);
              continue; // 다음 채팅으로 넘어감
            }

            // 기존 채팅 정보와 externalId가 일치하는 경우 - 정상 업데이트
            if (existingChat && existingChat.externalId === chat.id) {
              console.log(`채팅 ID ${chat.id}의 정보가 이미 존재합니다. 업데이트합니다.`);
              
              // 메시지 업데이트 처리 로직
              const hasNewMessageContent = chat.lastMessage !== existingChat.title;
              
              // 신규 메시지 판단 로직
              let newHasNewMessage = existingChat.hasNewMessage;
              let newUnreadCount = existingChat.unreadCount;
              
              // 신규 메시지 내용 변경 감지
              if (hasNewMessageContent) {
                newHasNewMessage = true;
              }
              
              // 읽지 않은 메시지 수 처리
              if (chat.unreadCount !== null && existingChat.unreadCount !== null) {
                if (chat.unreadCount > existingChat.unreadCount) {
                  newUnreadCount = chat.unreadCount;
                  newHasNewMessage = true;
                }
              } else if (chat.unreadCount !== null) {
                newUnreadCount = chat.unreadCount;
              }
              
              // 상태 자동 변경 로직
              let newStatus = existingChat.status;
              
              // 신규 메시지가 감지되고 현재 상태가 NEW일 때 IN_PROGRESS로 자동 변경
              if (newHasNewMessage && existingChat.status === 'NEW') {
                newStatus = 'IN_PROGRESS';
              }
              
              // 채팅 업데이트
              await prisma.chat.update({
                where: { id: existingChat.id },
                data: {
                  title: chat.title,
                  userName: chat.userName || null,
                  serviceType: chat.serviceType || null,
                  location: chat.location || null,
                  lastMessage: chat.lastMessage,
                  lastMessageTime: chat.lastMessageTime ? parseSafeDate(chat.lastMessageTime) : new Date(),
                  hasNewMessage: newHasNewMessage,
                  unreadCount: newUnreadCount,
                  price: chat.price,
                  link: chat.link,
                  status: newStatus,
                  updatedAt: new Date()
                }
              });
              
              console.log(`채팅 업데이트 완료: ${existingChat.id}`);
              continue; // 다음 채팅으로 넘어감
            }
          } catch (error) {
            console.error('채팅 데이터 저장 중 오류:', error);
            continue; // 오류가 발생해도 다음 채팅으로 넘어감
          }
        }
      } else {
        console.log('채팅 목록이 비어있습니다.');
      }

      return chatItems;
    } catch (error) {
      console.error('채팅 목록 가져오기 실패:', error);
      if (this.page) {
        const html = await this.page.content();
        console.log('현재 페이지 HTML:', html);
        await this.page.screenshot({ path: 'chat-list-error.png' });
      }
      return [];
    }
  }

  async getChatMessages(chatId: string, closeAfterComplete: boolean = false): Promise<boolean> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    try {
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'crawling');

      if (!this.isLoggedIn) {
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          setCrawlingStatus(chatId, 'error');
          throw new Error('로그인에 실패했습니다.');
        }
      }
      
      // 데이터베이스에서 채팅 정보 조회
      const existingChat = await prisma.chat.findFirst({
        where: { id: chatId },
        select: {
          id: true,
          externalId: true,
          title: true,
          hasNewMessage: true,
          unreadCount: true,
          status: true
        }
      });
      
      let chatUrl = '';

      if (!existingChat || !existingChat.externalId) {
        console.log(`채팅 ID ${chatId}에 대한 정보가 없거나 externalId가 없습니다.`);
        
        try {
          // 채팅 ID를 externalId로 사용하여 새 채팅 생성 시도
          const newExternalId = chatId; // 임시로 chatId를 externalId로 사용
          
          const createdChat = await prisma.chat.upsert({
            where: { id: chatId },
            update: {
              externalId: newExternalId,
              title: "새 채팅",
              status: 'NEW'
            },
            create: {
              id: chatId,
              externalId: newExternalId,
              title: "새 채팅",
              lastMessageTime: new Date(),
              hasNewMessage: false,
              unreadCount: 0,
              status: 'NEW'
            }
          });
          
          console.log(`채팅 생성 성공: ${createdChat.id}, externalId: ${createdChat.externalId}`);
          
          // 생성된 채팅 정보로 계속 진행
          chatUrl = `https://soomgo.com/pro/chats/${createdChat.externalId}?from=chatroom`;
        } catch (createError) {
          console.error(`채팅 생성 중 오류 발생:`, createError);
          setCrawlingStatus(chatId, 'error');
          return false;
        }
      } else {
        // 기존 채팅 정보가 있는 경우 원래 코드 실행
        chatUrl = `https://soomgo.com/pro/chats/${existingChat.externalId}?from=chatroom`;
      }

      // 채팅방으로 이동
      console.log(`채팅방으로 이동 중... URL: ${chatUrl}`);
      await this.page.goto(chatUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // 페이지 로딩 대기
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      
      // 채팅방 정보 추출
      const chatInfo = await this.extractChatInfo();
      console.log('채팅방 정보:', chatInfo);
      
      // 메시지 추출
      const messages = await this.extractChatMessages() as unknown as ChatMessage[];
      console.log(`총 ${messages.length}개의 메시지를 추출했습니다.`);
      
      // 채팅 데이터 업데이트
      const updateData: ChatUpdateData = {
        title: chatInfo.title || existingChat.title,
        hasNewMessage: false,
        unreadCount: 0,
        messageCount: messages.length
      };

      if (chatInfo.userName) updateData.userName = chatInfo.userName;
      if (chatInfo.serviceType) updateData.serviceType = chatInfo.serviceType;
      if (chatInfo.location) updateData.location = chatInfo.location;
      if (chatInfo.price) updateData.price = chatInfo.price;

      await prisma.chat.update({
        where: { id: chatId },
        data: updateData
      });
      
      // 메시지 저장
      await this.saveMessages(chatId, messages);
      
      console.log(`채팅 ID ${chatId}의 메시지 크롤링이 완료되었습니다.`);
      
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'completed');
      
      // 요청에 따라 브라우저 종료
      if (closeAfterComplete) {
        console.log('크롤링 완료 후 브라우저를 종료합니다...');
        
        // 1초 지연 후 브라우저 종료 (비동기적으로 수행)
        setTimeout(async () => {
          try {
            await this.close();
            console.log('브라우저가 성공적으로 종료되었습니다.');
          } catch (error) {
            console.error('브라우저 종료 중 오류 발생:', error);
          }
        }, 1000);
      }
      
      return true;
    } catch (error) {
      console.error('채팅 메시지 크롤링 중 오류 발생:', error);
      
      if (this.page) {
        await this.page.screenshot({ path: 'chat-error.png' });
      }
      
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'error');
      
      // 오류 발생 시에도 브라우저 종료 옵션 적용
      if (closeAfterComplete) {
        console.log('오류 발생 후 브라우저를 종료합니다...');
        
        // 1초 지연 후 브라우저 종료 (비동기적으로 수행)
        setTimeout(async () => {
          try {
            await this.close();
            console.log('브라우저가 성공적으로 종료되었습니다.');
          } catch (error) {
            console.error('브라우저 종료 중 오류 발생:', error);
          }
        }, 1000);
      }
      
      return false;
    }
  }

  private async extractChatInfo(): Promise<ChatInfo> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    const chatInfo = await this.page.evaluate(() => {
      // 제목 추출 (요청 제목)
      const titleElement = document.querySelector('.chat-room-header h1, .request-title, [class*="request-title"], .chat-room-title');
      const title = titleElement?.textContent?.trim() || '제목 없음';
      
      // 사용자 이름 추출
      const userNameElement = document.querySelector('.chat-room-header .user-name, .profile-name, [class*="user-name"]');
      const userName = userNameElement?.textContent?.trim() || undefined;
      
      // 서비스 유형 추출
      const serviceTypeElement = document.querySelector('.service-type, [class*="service-type"], .category-name');
      const serviceType = serviceTypeElement?.textContent?.trim() || undefined;
      
      // 위치 정보 추출
      const locationElement = document.querySelector('.location, [class*="location"], .region');
      const location = locationElement?.textContent?.trim() || undefined;
      
      // 가격 정보 추출 (견적 가격)
      const priceElement = document.querySelector('.price, [class*="price"], .quote-price, .estimate-price');
      const price = priceElement?.textContent?.trim() || undefined;
      
      return {
        title,
        userName,
        serviceType,
        location,
        price
      };
    });

    return chatInfo;
  }

  private async extractChatMessages(): Promise<ChatMessage[]> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    return await this.page.evaluate(() => {
      const messageElements = document.querySelectorAll('.chat-message, .message-item, [class*="message-bubble"], [class*="message-wrap"]');
      const messages: ChatMessage[] = [];
      
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
        let time: string;
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

  private async saveMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    try {
      console.log(`채팅 ID ${chatId}에 ${messages.length}개의 메시지 저장 시도 중...`);
      
      // 이미 저장된 메시지를 확인
      const existingMessages = await prisma.message.findMany({
        where: { chatId },
        select: { content: true, time: true, isMe: true }
      }) as { content: string; time: Date; isMe: boolean }[];
      
      console.log(`기존 메시지 ${existingMessages.length}개가 이미 저장되어 있습니다.`);
      
      // 새 메시지만 필터링 (내용과 시간이 정확히 일치하는 경우만 중복으로 처리)
      const newMessages = messages.filter(newMsg => {
        return !existingMessages.some(existingMsg => 
          existingMsg.content === newMsg.content && 
          existingMsg.time.toISOString() === newMsg.time &&
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

  public async close() {
    try {
      await this.browserManager.close();
      this.page = null;
      this.isLoggedInState = false;
      console.log('SoomgoCrawler: 브라우저가 종료되었습니다.');
    } catch (error) {
      console.error('브라우저 종료 중 오류 발생:', error);
    }
  }
}

// 메시지 저장 시 messageCount 업데이트 기능 추가
export async function upsertMessages(chatId: string, messages: {
  content: string;
  time: Date;
  isMe: boolean;
  messageType: 'CUSTOMER' | 'PRO' | 'SOOMGO';
}[]) {
  try {
    // 기존 메시지 삭제
    await prisma.message.deleteMany({
      where: { chatId }
    });

    // 새 메시지 생성
    await prisma.message.createMany({
      data: messages.map(msg => ({
        chatId,
        content: msg.content,
        time: msg.time,
        isMe: msg.isMe,
        messageType: msg.messageType
      }))
    });

    // 메시지 수 업데이트
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        messageCount: messages.length,
      }
    });
  } catch (error) {
    console.error('메시지 저장 중 오류 발생:', error);
    throw error;
  }
}

export class SoomgoChatMessageCrawler {
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

  async getChatMessages(chatId: string, closeAfterComplete: boolean = false): Promise<boolean> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    try {
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'crawling');

      if (!this.isLoggedIn) {
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          setCrawlingStatus(chatId, 'error');
          throw new Error('로그인에 실패했습니다.');
        }
      }
      
      // 데이터베이스에서 채팅 정보 조회
      const existingChat = await prisma.chat.findFirst({
        where: { id: chatId },
        select: {
          id: true,
          externalId: true,
          title: true,
          hasNewMessage: true,
          unreadCount: true,
          status: true
        }
      });
      
      let chatUrl = '';

      if (!existingChat || !existingChat.externalId) {
        console.log(`채팅 ID ${chatId}에 대한 정보가 없거나 externalId가 없습니다.`);
        
        try {
          // 채팅 ID를 externalId로 사용하여 새 채팅 생성 시도
          const newExternalId = chatId; // 임시로 chatId를 externalId로 사용
          
          const createdChat = await prisma.chat.upsert({
            where: { id: chatId },
            update: {
              externalId: newExternalId,
              title: "새 채팅",
              status: 'NEW'
            },
            create: {
              id: chatId,
              externalId: newExternalId,
              title: "새 채팅",
              lastMessageTime: new Date(),
              hasNewMessage: false,
              unreadCount: 0,
              status: 'NEW'
            }
          });
          
          console.log(`채팅 생성 성공: ${createdChat.id}, externalId: ${createdChat.externalId}`);
          
          // 생성된 채팅 정보로 계속 진행
          chatUrl = `https://soomgo.com/pro/chats/${createdChat.externalId}?from=chatroom`;
        } catch (createError) {
          console.error(`채팅 생성 중 오류 발생:`, createError);
          setCrawlingStatus(chatId, 'error');
          return false;
        }
      } else {
        // 기존 채팅 정보가 있는 경우 원래 코드 실행
        chatUrl = `https://soomgo.com/pro/chats/${existingChat.externalId}?from=chatroom`;
      }

      // 채팅방으로 이동
      console.log(`채팅방으로 이동 중... URL: ${chatUrl}`);
      await this.page.goto(chatUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // 페이지 로딩 대기
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(3000);
      
      // 채팅방 정보 추출
      const chatInfo = await this.extractChatInfo();
      console.log('채팅방 정보:', chatInfo);
      
      // 메시지 추출
      const messages = await this.extractChatMessages() as unknown as ChatMessage[];
      console.log(`총 ${messages.length}개의 메시지를 추출했습니다.`);
      
      // 채팅 데이터 업데이트
      const updateData: ChatUpdateData = {
        title: chatInfo.title || existingChat.title,
        hasNewMessage: false,
        unreadCount: 0,
        messageCount: messages.length
      };

      if (chatInfo.userName) updateData.userName = chatInfo.userName;
      if (chatInfo.serviceType) updateData.serviceType = chatInfo.serviceType;
      if (chatInfo.location) updateData.location = chatInfo.location;
      if (chatInfo.price) updateData.price = chatInfo.price;

      await prisma.chat.update({
        where: { id: chatId },
        data: updateData
      });
      
      // 메시지 저장
      await this.saveMessages(chatId, messages);
      
      console.log(`채팅 ID ${chatId}의 메시지 크롤링이 완료되었습니다.`);
      
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'completed');
      
      // 요청에 따라 브라우저 종료
      if (closeAfterComplete) {
        console.log('크롤링 완료 후 브라우저를 종료합니다...');
        
        // 1초 지연 후 브라우저 종료 (비동기적으로 수행)
        setTimeout(async () => {
          try {
            await this.close();
            console.log('브라우저가 성공적으로 종료되었습니다.');
          } catch (error) {
            console.error('브라우저 종료 중 오류 발생:', error);
          }
        }, 1000);
      }
      
      return true;
    } catch (error) {
      console.error('채팅 메시지 크롤링 중 오류 발생:', error);
      
      if (this.page) {
        await this.page.screenshot({ path: 'chat-error.png' });
      }
      
      // 크롤링 상태 업데이트
      setCrawlingStatus(chatId, 'error');
      
      // 오류 발생 시에도 브라우저 종료 옵션 적용
      if (closeAfterComplete) {
        console.log('오류 발생 후 브라우저를 종료합니다...');
        
        // 1초 지연 후 브라우저 종료 (비동기적으로 수행)
        setTimeout(async () => {
          try {
            await this.close();
            console.log('브라우저가 성공적으로 종료되었습니다.');
          } catch (error) {
            console.error('브라우저 종료 중 오류 발생:', error);
          }
        }, 1000);
      }
      
      return false;
    }
  }

  private async extractChatInfo(): Promise<ChatInfo> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    const chatInfo = await this.page.evaluate(() => {
      // 제목 추출 (요청 제목)
      const titleElement = document.querySelector('.chat-room-header h1, .request-title, [class*="request-title"], .chat-room-title');
      const title = titleElement?.textContent?.trim() || '제목 없음';
      
      // 사용자 이름 추출
      const userNameElement = document.querySelector('.chat-room-header .user-name, .profile-name, [class*="user-name"]');
      const userName = userNameElement?.textContent?.trim() || undefined;
      
      // 서비스 유형 추출
      const serviceTypeElement = document.querySelector('.service-type, [class*="service-type"], .category-name');
      const serviceType = serviceTypeElement?.textContent?.trim() || undefined;
      
      // 위치 정보 추출
      const locationElement = document.querySelector('.location, [class*="location"], .region');
      const location = locationElement?.textContent?.trim() || undefined;
      
      // 가격 정보 추출 (견적 가격)
      const priceElement = document.querySelector('.price, [class*="price"], .quote-price, .estimate-price');
      const price = priceElement?.textContent?.trim() || undefined;
      
      return {
        title,
        userName,
        serviceType,
        location,
        price
      };
    });

    return chatInfo;
  }

  private async extractChatMessages(): Promise<ChatMessage[]> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    return await this.page.evaluate(() => {
      const messageElements = document.querySelectorAll('.chat-message, .message-item, [class*="message-bubble"], [class*="message-wrap"]');
      const messages: ChatMessage[] = [];
      
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
        let time: string;
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

  private async saveMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    try {
      console.log(`채팅 ID ${chatId}에 ${messages.length}개의 메시지 저장 시도 중...`);
      
      // 이미 저장된 메시지를 확인
      const existingMessages = await prisma.message.findMany({
        where: { chatId },
        select: { content: true, time: true, isMe: true }
      }) as { content: string; time: Date; isMe: boolean }[];
      
      console.log(`기존 메시지 ${existingMessages.length}개가 이미 저장되어 있습니다.`);
      
      // 새 메시지만 필터링 (내용과 시간이 정확히 일치하는 경우만 중복으로 처리)
      const newMessages = messages.filter(newMsg => {
        return !existingMessages.some(existingMsg => 
          existingMsg.content === newMsg.content && 
          existingMsg.time.toISOString() === newMsg.time &&
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

// 헬퍼 함수: 문자열 형식의 날짜를 안전하게 Date 객체로 변환
function parseSafeDate(dateStr: string): Date {
  try {
    // '2025. 02. 13' 형식 처리
    if (/^\d{4}\.\s\d{2}\.\s\d{2}$/.test(dateStr)) {
      // 점과 공백 제거하고 하이픈으로 변환
      const normalized = dateStr.replace(/\./g, '-').replace(/\s/g, '');
      return new Date(normalized);
    } 
    // '시간 전' 형식 처리
    else if (dateStr.includes('시간 전')) {
      const hours = parseInt(dateStr.split('시간')[0].trim()) || 1;
      const date = new Date();
      date.setHours(date.getHours() - hours);
      return date;
    }
    // '일 전' 형식 처리
    else if (dateStr.includes('일 전')) {
      const days = parseInt(dateStr.split('일')[0].trim()) || 1;
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date;
    }
    // '분 전' 형식 처리
    else if (dateStr.includes('분 전')) {
      const minutes = parseInt(dateStr.split('분')[0].trim()) || 1;
      const date = new Date();
      date.setMinutes(date.getMinutes() - minutes);
      return date;
    }
    // 다른 형식은 현재 시간으로 설정
    return new Date();
  } catch (error) {
    console.error(`날짜 변환 중 오류 발생: ${dateStr}`, error);
    // 오류 발생 시 현재 시간 반환
    return new Date();
  }
} 