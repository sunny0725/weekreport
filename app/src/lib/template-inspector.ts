/**
 * HWPX 템플릿 검사기
 * - 템플릿 HWPX 안의 모든 {{PLACEHOLDER}} 패턴을 찾아 반환
 * - 소스 문서 텍스트들을 합산해 AI에게 전달할 컨텍스트 생성
 */
import JSZip from "jszip";

export type PlaceholderInfo = {
  key: string;          // 예: "TEAM_NAME"
  raw: string;          // 예: "{{TEAM_NAME}}"
  occurrences: number;  // 템플릿 내 등장 횟수
};

/**
 * HWPX XML 전체에서 {{KEY}} 패턴을 찾아 목록 반환
 */
export async function inspectTemplatePlaceholders(
  buffer: ArrayBuffer | Buffer
): Promise<PlaceholderInfo[]> {
  const zip = await JSZip.loadAsync(Buffer.from(buffer as ArrayBuffer));
  const counts = new Map<string, number>();

  for (const fileName of Object.keys(zip.files)) {
    const item = zip.files[fileName];
    if (item.dir || !fileName.toLowerCase().endsWith(".xml")) continue;

    const xml = await item.async("string");
    const matches = xml.matchAll(/\{\{([A-Z0-9_]+)\}\}/g);
    for (const m of matches) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, occurrences]) => ({
      key,
      raw: `{{${key}}}`,
      occurrences,
    }));
}

/**
 * 여러 소스 문서의 텍스트를 하나의 컨텍스트 문자열로 합산
 * AI 프롬프트에 전달할 용도
 */
export function mergeSourceTexts(
  sources: Array<{ fileName: string; plainText: string }>
): string {
  return sources
    .map(
      (s, i) =>
        `[문서 ${i + 1}: ${s.fileName}]\n${s.plainText.slice(0, 4000)}` +
        (s.plainText.length > 4000 ? "\n... (이하 생략)" : "")
    )
    .join("\n\n" + "─".repeat(40) + "\n\n");
}
