/**
 * OpenRouter 클라이언트 싱글톤
 *
 * OpenRouter = OpenAI 호환 API + 다양한 모델 접근
 * baseURL만 바꾸면 openai 패키지 그대로 사용 가능.
 *
 * 키는 서버 사이드(.env.local)에서만 참조 — 클라이언트 번들에 절대 포함 금지.
 */
import OpenAI from "openai";

function createClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다.\n" +
      "weekplan/app/.env.local 파일에 키를 입력하세요."
    );
  }

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      // OpenRouter 권장 헤더 — ASCII만 허용 (HTTP 헤더 규격)
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Weekly-Report-Automation",
    },
  });
}

// 모듈 수준 싱글톤 (서버 컴포넌트·API Route에서 재사용)
let _client: OpenAI | null = null;

export function getClient(): OpenAI {
  if (!_client) _client = createClient();
  return _client;
}

export function getModel(): string {
  return process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-5";
}
