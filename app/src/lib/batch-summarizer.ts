/**
 * 최대 5개 HWPX 문서를 AI로 일괄 요약하는 엔진
 *
 * 설계 원칙:
 * - OpenRouter (OpenAI 호환) 클라이언트 사용
 * - p-limit으로 동시 API 호출 수 제한 (rate limit 방지)
 * - 파일별 독립 처리 → 한 파일 실패가 전체에 영향 없음
 */
import pLimit from "p-limit";
import { getClient, getModel } from "./openrouter-client";
import type { HwpxDocument } from "./hwpx-extractor";

export type SummaryFormat = {
  title: string;              // 요약 섹션 제목
  fields: SummaryField[];     // 추출할 필드 목록
};

export type SummaryField = {
  key: string;                // 필드 키 (출력 JSON 키)
  label: string;              // 한국어 레이블
  description: string;        // AI에게 전달할 추출 지시
  maxLength?: number;         // 최대 글자 수 (선택)
};

export type DocumentSummary = {
  fileName: string;
  fields: Record<string, string>;
  rawText?: string;           // 원본 텍스트 (옵션)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type BatchSummaryResult = {
  summaries: DocumentSummary[];
  errors: Array<{ fileName: string; error: string }>;
  totalTokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
};

// 기본 주간보고 요약 형식 (경영현안회의 서식 기반)
export const WEEKLY_REPORT_FORMAT: SummaryFormat = {
  title: "주간 업무보고 요약",
  fields: [
    {
      key: "team",
      label: "팀명",
      description: "문서에서 팀명 또는 부서명을 추출하세요.",
      maxLength: 30,
    },
    {
      key: "period",
      label: "보고 주차",
      description: "보고 기간 또는 주차 정보를 추출하세요 (예: 1월 3주).",
      maxLength: 20,
    },
    {
      key: "thisWeek",
      label: "금주 실적",
      description:
        "이번 주 완료하거나 진행한 주요 업무 실적을 3~5개 항목으로 요약하세요. 각 항목은 개조식으로 작성.",
      maxLength: 500,
    },
    {
      key: "nextWeek",
      label: "차주 계획",
      description:
        "다음 주 예정된 주요 업무 계획을 3~5개 항목으로 요약하세요. 각 항목은 개조식으로 작성.",
      maxLength: 500,
    },
    {
      key: "issues",
      label: "이슈/리스크",
      description:
        "현안 이슈, 리스크, 협조 요청 사항이 있으면 추출하세요. 없으면 '해당 없음'으로 작성.",
      maxLength: 300,
    },
    {
      key: "keyAchievement",
      label: "핵심 성과",
      description: "이번 주 가장 중요한 성과나 결과물을 1~2문장으로 요약하세요.",
      maxLength: 200,
    },
  ],
};

// 공통 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 정부기관 주간업무보고 분석 전문가입니다.
주어진 한글(HWPX) 문서 텍스트에서 지정된 필드를 정확히 추출·요약합니다.

규칙:
- 문서에 명시된 내용만 추출 (추측 금지)
- 없는 정보는 "확인 불가"로 표기
- 한국어 공문서 어투 유지
- JSON 형식으로만 응답 (다른 텍스트 없이)`;

function buildUserPrompt(doc: HwpxDocument, format: SummaryFormat): string {
  const fieldInstructions = format.fields
    .map(
      (f) =>
        `"${f.key}": // ${f.label} - ${f.description}${
          f.maxLength ? ` (최대 ${f.maxLength}자)` : ""
        }`
    )
    .join("\n");

  return `파일명: ${doc.fileName}
단어 수: ${doc.wordCount}개

=== 문서 텍스트 ===
${doc.plainText.slice(0, 8000)}${doc.plainText.length > 8000 ? "\n... (이하 생략)" : ""}

=== 추출 지시 ===
아래 JSON 형식으로 필드를 추출하세요:
{
${fieldInstructions}
}`;
}

/** 429 rate limit 대응 지수 백오프 재시도 (최대 3회) */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        (err as { status?: number }).status === 429 ||
        String((err as { message?: string }).message).includes("rate");

      if (!isRateLimit || attempt === maxAttempts - 1) throw err;

      const waitSec = Math.pow(2, attempt + 1); // 2s, 4s, 8s
      console.warn(`[retry] rate limit 감지 — ${waitSec}초 후 재시도 (${attempt + 1}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
  throw new Error("최대 재시도 횟수 초과");
}

async function summarizeOneDocument(
  doc: HwpxDocument,
  format: SummaryFormat
): Promise<DocumentSummary> {
  const client = getClient();
  const model = getModel();

  const response = await withRetry(() =>
    client.chat.completions.create({
      model,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildUserPrompt(doc, format) },
      ],
    })
  );

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 응답에서 JSON을 파싱할 수 없습니다.");

  const fields = JSON.parse(jsonMatch[0]) as Record<string, string>;
  const usage = response.usage;

  return {
    fileName: doc.fileName,
    fields,
    tokenUsage: {
      inputTokens:  usage?.prompt_tokens     ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * 최대 5개 문서를 일괄 요약.
 * 동시 처리 수는 concurrency로 제어 (기본 3).
 */
export async function batchSummarize(
  docs: HwpxDocument[],
  format: SummaryFormat = WEEKLY_REPORT_FORMAT,
  options: { concurrency?: number; includeRawText?: boolean } = {}
): Promise<BatchSummaryResult> {
  const { concurrency = 3, includeRawText = false } = options;
  const limit = pLimit(concurrency);

  const summaries: DocumentSummary[] = [];
  const errors: BatchSummaryResult["errors"] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };

  await Promise.all(
    docs.map((doc) =>
      limit(async () => {
        try {
          const summary = await summarizeOneDocument(doc, format);
          if (includeRawText) summary.rawText = doc.plainText;
          if (summary.tokenUsage) {
            totalUsage.inputTokens  += summary.tokenUsage.inputTokens;
            totalUsage.outputTokens += summary.tokenUsage.outputTokens;
          }
          summaries.push(summary);
        } catch (err) {
          errors.push({
            fileName: doc.fileName,
            error: err instanceof Error ? err.message : "요약 실패",
          });
        }
      })
    )
  );

  // 원본 파일 순서 유지
  summaries.sort(
    (a, b) =>
      docs.findIndex((d) => d.fileName === a.fileName) -
      docs.findIndex((d) => d.fileName === b.fileName)
  );

  return { summaries, errors, totalTokenUsage: totalUsage };
}
