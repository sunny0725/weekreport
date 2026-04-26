/**
 * 주간보고 데이터 → HWPX 플레이스홀더 매핑 및 AI 요약 생성
 */
import Anthropic from "@anthropic-ai/sdk";
import { applyPlaceholders } from "./hwpx";
import fs from "node:fs/promises";
import path from "node:path";

export type WeeklyReportInput = {
  teamName: string;        // 예: AI미래전략센터
  author: string;          // 작성자명
  weekLabel: string;       // 예: 1월 3주
  reportDate: string;      // 예: 2024.01.15
  thisWeekWork: string[];  // 금주 실적 목록
  nextWeekPlan: string[];  // 차주 계획 목록
  issues: string[];        // 이슈/리스크
  kpiTarget?: number;      // KPI 목표치
  kpiActual?: number;      // KPI 실적치
};

export type WeeklyReportData = {
  TEAM_NAME: string;
  AUTHOR: string;
  WEEK_LABEL: string;
  REPORT_DATE: string;
  THIS_WEEK_SUMMARY: string;
  NEXT_WEEK_SUMMARY: string;
  ISSUES_SUMMARY: string;
  KPI_RATE: string;
  THIS_WEEK_DETAIL: string;
  NEXT_WEEK_DETAIL: string;
  ISSUES_DETAIL: string;
};

const client = new Anthropic();

export async function generateSummaries(input: WeeklyReportInput): Promise<{
  thisWeek: string;
  nextWeek: string;
  issues: string;
}> {
  const systemPrompt = `당신은 정부기관 주간업무보고 작성 전문가입니다.
입력된 업무 내용을 공문서 스타일의 간결한 한국어 문장으로 요약합니다.
- 핵심만 추출하여 1~2문장으로 압축
- 수동태·공문서 어투 사용 (예: "~추진", "~완료", "~예정")
- 개조식 서술 지양, 서술형으로 작성`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // 프롬프트 캐싱: 시스템 프롬프트 재사용 시 비용 절감
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `팀명: ${input.teamName}
금주 실적: ${input.thisWeekWork.join(" / ")}
차주 계획: ${input.nextWeekPlan.join(" / ")}
이슈/리스크: ${input.issues.join(" / ")}

각 항목을 1~2문장으로 요약해주세요.
JSON 형식으로만 응답: {"thisWeek": "...", "nextWeek": "...", "issues": "..."}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 요약 파싱 실패");

  return JSON.parse(jsonMatch[0]);
}

export function buildPlaceholders(
  input: WeeklyReportInput,
  summaries: { thisWeek: string; nextWeek: string; issues: string }
): WeeklyReportData {
  const kpiRate =
    input.kpiTarget && input.kpiActual
      ? `${Math.round((input.kpiActual / input.kpiTarget) * 100)}%`
      : "-";

  return {
    TEAM_NAME: input.teamName,
    AUTHOR: input.author,
    WEEK_LABEL: input.weekLabel,
    REPORT_DATE: input.reportDate,
    THIS_WEEK_SUMMARY: summaries.thisWeek,
    NEXT_WEEK_SUMMARY: summaries.nextWeek,
    ISSUES_SUMMARY: summaries.issues,
    KPI_RATE: kpiRate,
    THIS_WEEK_DETAIL: input.thisWeekWork
      .map((item, i) => `${i + 1}. ${item}`)
      .join("\n"),
    NEXT_WEEK_DETAIL: input.nextWeekPlan
      .map((item, i) => `${i + 1}. ${item}`)
      .join("\n"),
    ISSUES_DETAIL: input.issues
      .map((item, i) => `${i + 1}. ${item}`)
      .join("\n"),
  };
}

export async function generateHwpxReport(input: WeeklyReportInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "templates", "weekly_report_template.hwpx");

  let templateBuffer: Buffer;
  try {
    templateBuffer = await fs.readFile(templatePath);
  } catch {
    throw new Error(
      "템플릿 파일이 없습니다. templates/weekly_report_template.hwpx 파일을 준비해주세요.\n" +
      "한글 오피스에서 기존 .hwp 파일을 열고 '다른 이름으로 저장 → .hwpx'로 변환한 뒤,\n" +
      "치환할 내용을 {{PLACEHOLDER}} 형식으로 표시하세요."
    );
  }

  const summaries = await generateSummaries(input);
  const placeholders = buildPlaceholders(input, summaries);

  const arrayBuffer = templateBuffer.buffer.slice(
    templateBuffer.byteOffset,
    templateBuffer.byteOffset + templateBuffer.byteLength
  ) as ArrayBuffer;

  return applyPlaceholders(arrayBuffer, placeholders);
}
