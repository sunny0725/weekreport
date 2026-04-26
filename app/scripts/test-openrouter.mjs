/**
 * OpenRouter API 직접 테스트
 * Gemma 모델 응답 확인
 */
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// .env.local 직접 읽기
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const envVars = Object.fromEntries(
  envContent.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim()];
    })
);

const OPENROUTER_API_KEY = envVars.OPENROUTER_API_KEY;
const MODEL = envVars.OPENROUTER_MODEL ?? "google/gemma-3-27b-it:free";

console.log(`모델: ${MODEL}`);
console.log(`키 앞 10자: ${OPENROUTER_API_KEY?.slice(0, 15)}...`);

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Weekly-Report-Automation",
  },
});

// 1. 간단한 핑 테스트
console.log("\n1. 기본 응답 테스트...");
try {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 100,
    messages: [{ role: "user", content: "안녕하세요. 한국어로 짧게 인사해주세요." }],
  });
  console.log("✅ 응답:", res.choices[0].message.content);
  console.log("   토큰:", res.usage);
} catch (e) {
  console.error("❌ 기본 테스트 실패");
  console.error("   status:", e.status);
  console.error("   message:", e.message);
  if (e.error) console.error("   error body:", JSON.stringify(e.error, null, 2));
}

// 2. 주간보고 요약 테스트
console.log("\n2. 주간보고 요약 테스트...");
try {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: "You are a document summarizer. Extract fields from Korean government weekly reports. Respond in JSON only.",
      },
      {
        role: "user",
        content: `다음 주간보고 텍스트에서 팀명, 금주실적, 차주계획, 이슈를 JSON으로 추출하세요:

AI미래전략센터
2024년 1월 3주 경영현안회의
1. 금주 실적
[GDX 2023-5] 데이터 혁신 성숙도 측정 및 진단 모형 개발 추진
인공지능(AI) 정책 및 법제도 현황 조사 완료 (1.11)
2024년도 디지털화정책추진계획 수립 착수 (1.10)
2. 차주 계획
데이터 혁신 성숙도 측정 도구 초안 작성 예정
AI 전략 보고서 2차 검토 회의 참석 예정 (1.18)
3. 이슈 및 리스크
외부기관 데이터 수집 지연으로 일정 조정 필요

JSON 형식: {"team":"","thisWeek":"","nextWeek":"","issues":""}`,
      },
    ],
  });
  console.log("✅ 요약 성공!");
  console.log("   응답:", res.choices[0].message.content);
  console.log("   토큰: 입력", res.usage.prompt_tokens, "/ 출력", res.usage.completion_tokens);
} catch (e) {
  console.error("❌ 요약 테스트 실패");
  console.error("   status:", e.status);
  console.error("   message:", e.message);
  if (e.error) console.error("   error body:", JSON.stringify(e.error, null, 2));
}
