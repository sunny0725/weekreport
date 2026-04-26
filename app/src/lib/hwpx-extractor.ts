/**
 * HWPX 문서에서 구조적 텍스트를 추출하는 모듈
 * 참조 스펙: https://github.com/hancom-io/hwpx-owpml-model (OWPML)
 *
 * OWPML 핵심 구조:
 *   hp:sec  → 섹션
 *   hp:p    → 단락(paragraph)
 *   hp:tbl  → 표
 *   hp:tc   → 표 셀
 *   hp:t    → 실제 텍스트 노드
 */
import JSZip from "jszip";

export type ExtractedParagraph = {
  text: string;
  isTable: boolean;      // 표 셀 내부 텍스트 여부
  tableRow?: number;
  tableCol?: number;
};

export type HwpxDocument = {
  fileName: string;
  paragraphs: ExtractedParagraph[];
  plainText: string;     // 전체 텍스트 (AI 입력용)
  wordCount: number;
};

// OLE HWP 파일 시그니처 (D0 CF 11 E0)
const HWP_OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

export function isLegacyHwp(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return HWP_OLE_SIGNATURE.every((b, i) => bytes[i] === b);
}

export function isHwpx(buffer: ArrayBuffer): boolean {
  // ZIP 시그니처: PK (50 4B)
  const bytes = new Uint8Array(buffer.slice(0, 2));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * OWPML XML에서 <hp:t> 텍스트 노드를 추출.
 * 표 안의 텍스트는 isTable=true로 마킹.
 */
function extractFromXml(xmlText: string): ExtractedParagraph[] {
  const paragraphs: ExtractedParagraph[] = [];

  // 표 영역 먼저 파싱 (hp:tbl)
  const tblRegex = /<[a-z]+:tbl[\s>]([\s\S]*?)<\/[a-z]+:tbl>/g;
  const tableRanges: Array<{ start: number; end: number }> = [];
  let tblMatch;
  while ((tblMatch = tblRegex.exec(xmlText)) !== null) {
    tableRanges.push({ start: tblMatch.index, end: tblMatch.index + tblMatch[0].length });
  }

  function isInsideTable(pos: number): boolean {
    return tableRanges.some((r) => pos >= r.start && pos <= r.end);
  }

  // 단락(hp:p) 단위로 파싱
  const pRegex = /<[a-z]+:p[\s>]([\s\S]*?)<\/[a-z]+:p>/g;
  let pMatch;

  while ((pMatch = pRegex.exec(xmlText)) !== null) {
    const pContent = pMatch[1];
    const pStart = pMatch.index;

    // <hp:t> 노드에서 텍스트 수집
    const tRegex = /<[a-z]+:t(?:\s[^>]*)?>([^<]*)<\/[a-z]+:t>/g;
    let tMatch;
    let combined = "";

    while ((tMatch = tRegex.exec(pContent)) !== null) {
      combined += tMatch[1];
    }

    // XML 엔티티 디코딩
    const text = combined
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();

    if (text) {
      paragraphs.push({
        text,
        isTable: isInsideTable(pStart),
      });
    }
  }

  return paragraphs;
}

/**
 * HWPX 파일(ArrayBuffer)에서 텍스트 추출.
 * Contents/section*.xml 파일들을 순서대로 처리.
 */
export async function extractHwpxText(
  buffer: ArrayBuffer,
  fileName: string
): Promise<HwpxDocument> {
  if (isLegacyHwp(buffer)) {
    throw new Error(
      `"${fileName}"은 구형 HWP(OLE) 형식입니다.\n` +
      "한글 오피스에서 열고 [파일 → 다른 이름으로 저장 → .hwpx]로 변환 후 업로드해주세요."
    );
  }

  if (!isHwpx(buffer)) {
    throw new Error(`"${fileName}"은 지원되지 않는 파일 형식입니다.`);
  }

  // ArrayBuffer → Buffer 변환: Next.js 16 App Router 환경에서 JSZip 호환성 보장
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  const paragraphs: ExtractedParagraph[] = [];

  // section 파일 정렬 후 순서대로 처리 (section0, section1, ...)
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/section(\d+)/)?.[1] ?? "0");
      const numB = parseInt(b.match(/section(\d+)/)?.[1] ?? "0");
      return numA - numB;
    });

  for (const sectionName of sectionFiles) {
    const xml = await zip.files[sectionName].async("string");
    paragraphs.push(...extractFromXml(xml));
  }

  const plainText = paragraphs.map((p) => p.text).join("\n");
  const wordCount = plainText.replace(/\s+/g, " ").split(" ").filter(Boolean).length;

  return { fileName, paragraphs, plainText, wordCount };
}

/**
 * 여러 HWPX 파일을 병렬로 텍스트 추출 (최대 20개).
 */
export async function extractMultipleHwpx(
  files: Array<{ name: string; buffer: ArrayBuffer | Buffer }>
): Promise<Array<HwpxDocument | { fileName: string; error: string }>> {
  if (files.length > 5) {
    throw new Error("최대 5개 파일까지 처리 가능합니다.");
  }

  return Promise.all(
    files.map(async ({ name, buffer }) => {
      try {
        return await extractHwpxText(buffer as ArrayBuffer, name);
      } catch (err) {
        return {
          fileName: name,
          error: err instanceof Error ? err.message : "추출 실패",
        };
      }
    })
  );
}
