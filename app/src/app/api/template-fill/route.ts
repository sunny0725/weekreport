/**
 * POST /api/template-fill
 *
 * 소스 HWPX(들)에서 내용을 추출 → AI 요약 → 내장 서식으로 HWPX 생성
 * 생성된 HWPX는 브라우저로 다운로드되며 서버 output/ 폴더에도 저장됩니다.
 *
 * Request: multipart/form-data
 *   sources : File[]  (내용을 추출할 HWPX, 최대 5개)
 *
 * Response: application/hwpx (완성된 HWPX)
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

/* ────────────────────────────────────────────
   내장 주간보고 서식 정의
   ──────────────────────────────────────────── */
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

/** 추출된 필드로 올바른 OWPML 구조의 HWPX 바이트를 생성 */
async function buildHwpxFromFields(fields: ReportFields): Promise<Buffer> {
  const paragraphs: string[] = [
    "경영현안회의 주간업무보고",
    `팀명: ${fields.teamName}`,
    `보고 주차: ${fields.weekLabel}`,
    `보고일: ${fields.reportDate}`,
    "1. 금주 실적",
    ...(fields.thisWeek || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean),
    "2. 차주 계획",
    ...(fields.nextWeek || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean),
    "3. 이슈 및 리스크",
    fields.issues || "해당 없음",
    "4. 핵심 성과",
    fields.achievement || "해당 없음",
  ];

  /* ── 올바른 OWPML 네임스페이스로 section0.xml 생성 ── */
  const pNodes = paragraphs
    .map(
      (text, i) => `  <hp:p id="${i + 1}">
    <hp:pPr><hp:pStyle paraPrIDRef="0"/></hp:pPr>
    <hp:run><hp:runPr/><hp:t>${escXml(text)}</hp:t></hp:run>
  </hp:p>`
    )
    .join("\n");

  // 루트는 <hs:sec> — section 네임스페이스 (paragraph 아님)
  const sectionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
${pNodes}
</hs:sec>`;

  // Hancom Package Format (ePub OPF 아님)
  const contentHpf = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hpf:package xmlns:hpf="http://www.hancom.co.kr/hwpml/2011/package">
  <hpf:metadata/>
  <hpf:manifest>
    <hpf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </hpf:manifest>
  <hpf:spine>
    <hpf:itemref idref="section0"/>
  </hpf:spine>
</hpf:package>`;

  // container.xml — ZIP 리더가 진입점을 찾는 필수 파일
  const containerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rootFiles>
  <rootFile fullPath="Contents/content.hpf"/>
</rootFiles>`;

  const versionXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ver:versionsupport xmlns:ver="http://www.hancom.co.kr/hwpml/2011/version">
  <ver:version>1.3</ver:version>
</ver:versionsupport>`;

  const zip = new JSZip();
  // mimetype 은 반드시 압축 없이(STORE) 첫 번째로 추가
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file("version.xml",               versionXml);
  zip.file("META-INF/container.xml",    containerXml);
  zip.file("Contents/content.hpf",      contentHpf);
  zip.file("Contents/section0.xml",     sectionXml);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** output 디렉토리에 파일 저장 (없으면 생성) */
async function saveToOutputDir(buf: Buffer, fileName: string): Promise<string> {
  const outputDir = process.env.REPORT_OUTPUT_DIR
    ? path.resolve(process.cwd(), process.env.REPORT_OUTPUT_DIR)
    : path.resolve(process.cwd(), "output");

  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, buf);
  return filePath;
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
        name: f.name,
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

    /* ── 3. HWPX 생성 ── */
    const hwpxBuf = await buildHwpxFromFields(fields);

    const dateStr   = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const baseName  = `${fields.weekLabel || dateStr}_${fields.teamName || "주간보고"}_통합.hwpx`;

    /* ── 4. 서버 output/ 폴더에 저장 ── */
    try {
      await saveToOutputDir(hwpxBuf, baseName);
    } catch (saveErr) {
      console.warn("[template-fill] output 저장 실패:", saveErr);
      // 저장 실패해도 다운로드는 계속 진행
    }

    const outName = encodeURIComponent(baseName);

    return new NextResponse(new Uint8Array(hwpxBuf), {
      status: 200,
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${outName}`,
        "X-Output-Filename":   outName,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
