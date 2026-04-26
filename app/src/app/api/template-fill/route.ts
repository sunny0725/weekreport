/**
 * POST /api/template-fill
 *
 * 소스 HWPX(들)에서 내용을 추출 → AI 요약 → 실제 HWPX 구조 기반으로 보고서 생성
 * 베이스 템플릿(base-template.hwpx)의 header.xml 등 구조를 유지하고
 * section0.xml 내용만 교체하므로 한글에서 정상 열립니다.
 */
import { NextRequest, NextResponse } from "next/server";
import { extractMultipleHwpx } from "@/lib/hwpx-extractor";
import { mergeSourceTexts } from "@/lib/template-inspector";
import { getClient, getModel } from "@/lib/openrouter-client";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import type { HwpxDocument } from "@/lib/hwpx-extractor";

export const maxDuration = 60; // Vercel 무료 플랜 한도

type ReportFields = {
  teamName:    string;
  weekLabel:   string;
  reportDate:  string;
  thisWeek:    string;
  nextWeek:    string;
  issues:      string;
  achievement: string;
};

function escXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 베이스 템플릿 HWPX를 로드하고 section0.xml만 교체해서 반환
 * → header.xml, META-INF/*, content.hpf 등 Hangul 필수 구조 유지
 */
async function buildHwpxFromTemplate(fields: ReportFields): Promise<Buffer> {
  // 베이스 템플릿 로드 (실제 Hancom HWPX 구조)
  const templatePath = path.join(process.cwd(), "src", "lib", "base-template.hwpx");
  const templateBuf  = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(Buffer.from(templateBuf));

  // 본문 단락 구성
  const paragraphs: string[] = [
    "경영현안회의 주간업무보고",
    `팀명: ${fields.teamName}`,
    `보고 주차: ${fields.weekLabel}`,
    `보고일: ${fields.reportDate}`,
    "",
    "【 금주 실적 】",
    ...(fields.thisWeek || "").split(/[;\n]+/).map(s => s.trim()).filter(Boolean),
    "",
    "【 차주 계획 】",
    ...(fields.nextWeek || "").split(/[;\n]+/).map(s => s.trim()).filter(Boolean),
    "",
    "【 이슈 및 리스크 】",
    fields.issues || "해당 없음",
    "",
    "【 핵심 성과 】",
    fields.achievement || "해당 없음",
  ];

  // 기존 section0.xml에서 네임스페이스 선언 추출 (실제 파일 기반)
  const origSec = await zip.file("Contents/section0.xml")!.async("string");
  const nsMatch  = origSec.match(/<hs:sec([^>]+)>/);
  const nsAttrs  = nsMatch ? nsMatch[1] : ` xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"`;

  // 단락 XML 생성 (기존 파일의 단락 구조 참고)
  const pXml = paragraphs.map((text, i) => {
    const pid = 100 + i;
    if (text === "") {
      // 빈 줄
      return `<hp:p id="${pid}"><hp:pPr><hp:pStyle paraPrIDRef="0"/></hp:pPr><hp:run><hp:runPr/><hp:t/></hp:run></hp:p>`;
    }
    const isBold = text.startsWith("【") || i === 0;
    return `<hp:p id="${pid}"><hp:pPr><hp:pStyle paraPrIDRef="0"/></hp:pPr><hp:run><hp:runPr>${isBold ? '<hp:bold/>' : ''}</hp:runPr><hp:t>${escXml(text)}</hp:t></hp:run></hp:p>`;
  }).join("");

  const newSectionXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>` +
    `<hs:sec${nsAttrs}>${pXml}</hs:sec>`;

  zip.file("Contents/section0.xml", newSectionXml);

  // content.hpf 메타데이터 업데이트 (제목)
  const hpf = await zip.file("Contents/content.hpf")!.async("string");
  const newHpf = hpf.replace(
    /<opf:title>[^<]*<\/opf:title>/,
    `<opf:title>${escXml(`${fields.weekLabel} ${fields.teamName} 주간보고`)}</opf:title>`
  );
  zip.file("Contents/content.hpf", newHpf);

  // Preview 텍스트 업데이트 (선택)
  const prvText = paragraphs.filter(p => p).join("\n");
  if (zip.file("Preview/PrvText.txt")) {
    zip.file("Preview/PrvText.txt", prvText);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** output 디렉토리에 파일 저장 */
async function saveToOutputDir(buf: Buffer, fileName: string): Promise<void> {
  const outputDir = path.resolve(
    process.cwd(),
    process.env.REPORT_OUTPUT_DIR ?? "output"
  );
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, fileName), buf);
}

export async function POST(req: NextRequest) {
  try {
    const formData    = await req.formData();
    const sourceFiles = formData.getAll("sources") as File[];

    if (sourceFiles.length === 0)
      return NextResponse.json({ error: "sources 파일이 최소 1개 필요합니다." }, { status: 400 });
    if (sourceFiles.length > 5)
      return NextResponse.json({ error: "최대 5개까지 허용됩니다." }, { status: 400 });

    /* ── 1. 텍스트 추출 ── */
    const sourceBuffers = await Promise.all(
      sourceFiles.map(async (f) => ({
        name:   f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const extractResults = await extractMultipleHwpx(sourceBuffers);
    const validDocs: HwpxDocument[] = [];
    const extractErrors: string[]   = [];

    for (const r of extractResults) {
      if ("error" in r) extractErrors.push(`${r.fileName}: ${r.error}`);
      else validDocs.push(r);
    }

    if (validDocs.length === 0)
      return NextResponse.json(
        { error: `텍스트 추출 실패:\n${extractErrors.join("\n")}` },
        { status: 400 }
      );

    const mergedText = mergeSourceTexts(
      validDocs.map((d) => ({ fileName: d.fileName, plainText: d.plainText }))
    );

    /* ── 2. AI 필드 추출 ── */
    const client = getClient();
    const model  = getModel();

    const aiRes = await client.chat.completions.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "당신은 한국어 주간업무보고 분석 전문가입니다. " +
            "소스 문서에서 필드를 정확히 추출하고 JSON으로만 응답하세요.",
        },
        {
          role: "user",
          content:
            `=== 소스 문서 ===\n${mergedText}\n\n` +
            `위 문서에서 아래 JSON 필드를 추출하세요. 없으면 빈 문자열:\n` +
            `{\n` +
            `  "teamName":    "",  // 팀명/부서명\n` +
            `  "weekLabel":   "",  // 보고 주차 (예: 1월 3주)\n` +
            `  "reportDate":  "",  // 보고일 또는 작성일\n` +
            `  "thisWeek":    "",  // 금주 실적 (개조식, 항목 사이 세미콜론)\n` +
            `  "nextWeek":    "",  // 차주 계획 (개조식, 항목 사이 세미콜론)\n` +
            `  "issues":      "",  // 이슈/리스크 (없으면 빈 문자열)\n` +
            `  "achievement": ""   // 핵심 성과 1~2문장\n` +
            `}`,
        },
      ],
    });

    const aiText    = aiRes.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 응답 파싱 실패");

    const fields = JSON.parse(jsonMatch[0]) as ReportFields;

    /* ── 3. HWPX 생성 (베이스 템플릿 기반) ── */
    const hwpxBuf = await buildHwpxFromTemplate(fields);

    const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const baseName = `${fields.weekLabel || dateStr}_${fields.teamName || "주간보고"}_통합.hwpx`;

    /* ── 4. 서버 저장 (실패해도 다운로드 계속) ── */
    saveToOutputDir(hwpxBuf, baseName).catch((e) =>
      console.warn("[template-fill] output 저장 실패:", e)
    );

    return new NextResponse(new Uint8Array(hwpxBuf), {
      status: 200,
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
