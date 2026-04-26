/**
 * POST /api/batch-summarize
 * 최대 20개 HWPX 파일을 받아 AI로 일괄 요약 → JSON 반환
 *
 * Request: multipart/form-data
 *   files: File[] (최대 20개, .hwpx)
 *   format?: JSON string (SummaryFormat, 생략 시 기본 주간보고 형식 사용)
 *   concurrency?: number (동시 처리 수, 기본 4)
 *
 * Response: { summaries, errors, totalTokenUsage }
 */
import { NextRequest, NextResponse } from "next/server";
import { extractMultipleHwpx } from "@/lib/hwpx-extractor";
import {
  batchSummarize,
  WEEKLY_REPORT_FORMAT,
  type SummaryFormat,
} from "@/lib/batch-summarizer";
import type { HwpxDocument } from "@/lib/hwpx-extractor";

export const maxDuration = 60; // Vercel 무료 플랜 한도

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFiles = formData.getAll("files") as File[];

    if (!rawFiles.length) {
      return NextResponse.json({ error: "files 필드가 없습니다." }, { status: 400 });
    }
    if (rawFiles.length > 5) {
      return NextResponse.json({ error: "최대 5개 파일까지 처리 가능합니다." }, { status: 400 });
    }

    // 커스텀 요약 형식 (옵션)
    let format: SummaryFormat = WEEKLY_REPORT_FORMAT;
    const rawFormat = formData.get("format");
    if (rawFormat && typeof rawFormat === "string") {
      try {
        format = JSON.parse(rawFormat);
      } catch {
        return NextResponse.json({ error: "format JSON 파싱 오류" }, { status: 400 });
      }
    }

    // :free 모델은 rate limit이 엄격하므로 기본 동시성 2로 제한
    const concurrency = Number(formData.get("concurrency") ?? 2);

    // 파일 → ArrayBuffer 변환
    const fileBuffers = await Promise.all(
      rawFiles.map(async (file) => ({
        name: file.name,
        // Buffer.from()으로 명시 변환 — Next.js 16 App Router + JSZip 호환성
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );

    // 1단계: HWPX 텍스트 추출
    const extractResults = await extractMultipleHwpx(fileBuffers);

    const validDocs: HwpxDocument[] = [];
    const extractErrors: Array<{ fileName: string; error: string }> = [];

    for (const result of extractResults) {
      if ("error" in result) {
        extractErrors.push({ fileName: result.fileName, error: result.error });
      } else {
        validDocs.push(result);
      }
    }

    // 2단계: 유효한 문서만 AI 요약
    const batchResult = await batchSummarize(validDocs, format, { concurrency });

    return NextResponse.json({
      summaries: batchResult.summaries,
      errors: [...extractErrors, ...batchResult.errors],
      totalTokenUsage: batchResult.totalTokenUsage,
      stats: {
        total: rawFiles.length,
        succeeded: batchResult.summaries.length,
        failed: extractErrors.length + batchResult.errors.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
