/**
 * HWPX 파일 조작 라이브러리
 * 출처: https://github.com/merryAI-dev/hwpx-report-automation
 * 핵심 원리: HWPX = ZIP 파일. XML 전체 재직렬화 없이 텍스트 노드만 교체.
 */
import JSZip from "jszip";

export type TextNodeRecord = {
  id: string;
  fileName: string;
  textIndex: number;
  text: string;
  tag: string;
  styleHints: Record<string, string>;
};

export type TextEdit = {
  id: string;
  fileName: string;
  textIndex: number;
  oldText: string;
  newText: string;
};

export type XmlSegment = {
  textIndex: number;
  start: number;
  end: number;
  isCdata: boolean;
  text: string;
};

const STYLE_KEYS = ["style", "pridref", "idref", "font", "face", "align"];
const REQUIRED_ENTRIES = ["mimetype", "version.xml", "Contents/content.hpf"];
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export class ZipExpansionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipExpansionError";
  }
}

async function validateZipSize(buffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  let totalUncompressed = 0;
  for (const file of Object.values(zip.files)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalUncompressed += (file as any)._data?.uncompressedSize ?? 0;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new ZipExpansionError("언패킹 크기 50MB 초과");
    }
  }
}

function isXmlName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xml");
}

function isWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    const lower = String(entity).toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower.startsWith("#x")) {
      const code = parseInt(lower.slice(2), 16);
      return isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = parseInt(lower.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sanitizeCdata(value: string): string {
  return value.replaceAll("]]>", "]]]]><![CDATA[>");
}

export function scanXmlTextSegments(xmlText: string): XmlSegment[] {
  const segments: XmlSegment[] = [];
  const len = xmlText.length;
  let i = 0;
  let textIndex = 0;

  while (i < len) {
    if (xmlText[i] === "<") {
      if (xmlText.startsWith("<!--", i)) {
        const end = xmlText.indexOf("-->", i + 4);
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (xmlText.startsWith("<![CDATA[", i)) {
        const start = i + 9;
        const endCdata = xmlText.indexOf("]]>", start);
        const end = endCdata === -1 ? len : endCdata;
        const raw = xmlText.slice(start, end);
        if (!isWhitespace(raw)) {
          segments.push({ textIndex, start, end, isCdata: true, text: raw });
        }
        textIndex += 1;
        i = endCdata === -1 ? len : endCdata + 3;
        continue;
      }
      i += 1;
      while (i < len) {
        const ch = xmlText[i];
        if (ch === '"' || ch === "'") {
          const quote = ch;
          i += 1;
          while (i < len && xmlText[i] !== quote) i += 1;
          i += 1;
          continue;
        }
        if (ch === ">") { i += 1; break; }
        i += 1;
      }
      continue;
    }
    const start = i;
    while (i < len && xmlText[i] !== "<") i += 1;
    const end = i;
    const raw = xmlText.slice(start, end);
    const decoded = decodeXmlEntities(raw);
    if (!isWhitespace(decoded)) {
      segments.push({ textIndex, start, end, isCdata: false, text: decoded });
    }
    textIndex += 1;
  }
  return segments;
}

export function applyEditsToXmlText(xmlText: string, patchMap: Map<number, string>): string {
  if (!patchMap.size) return xmlText;
  const segments = scanXmlTextSegments(xmlText);
  if (!segments.length) return xmlText;

  let cursor = 0;
  let out = "";
  let changed = false;

  for (const seg of segments) {
    if (!patchMap.has(seg.textIndex)) continue;
    const value = patchMap.get(seg.textIndex) ?? "";
    const replacement = seg.isCdata ? sanitizeCdata(value) : escapeXml(value);
    out += xmlText.slice(cursor, seg.start);
    out += replacement;
    cursor = seg.end;
    changed = true;
  }

  if (!changed) return xmlText;
  out += xmlText.slice(cursor);
  return out;
}

type RepackItem = { fileName: string; data: string | Uint8Array };

async function repackHwpx(entries: RepackItem[]): Promise<Buffer> {
  const out = new JSZip();
  const ordered: RepackItem[] = [];
  const map = new Map(entries.map((e) => [e.fileName, e]));

  // mimetype 반드시 첫 번째, STORE 압축
  if (map.has("mimetype")) {
    ordered.push(map.get("mimetype")!);
    map.delete("mimetype");
  }
  for (const entry of entries) {
    if (map.has(entry.fileName)) {
      ordered.push(entry);
      map.delete(entry.fileName);
    }
  }

  for (const entry of ordered) {
    const options = entry.fileName === "mimetype" ? { compression: "STORE" as const } : undefined;
    out.file(entry.fileName, entry.data, options);
  }

  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function inspectHwpx(
  fileBuffer: ArrayBuffer
): Promise<{ textNodes: TextNodeRecord[]; integrityIssues: string[] }> {
  await validateZipSize(fileBuffer);
  const zip = await JSZip.loadAsync(Buffer.from(fileBuffer));
  const textNodes: TextNodeRecord[] = [];

  for (const fileName of Object.keys(zip.files)) {
    const item = zip.files[fileName];
    if (item.dir || !isXmlName(fileName)) continue;

    const xmlText = await item.async("string");
    const segments = scanXmlTextSegments(xmlText);

    for (const seg of segments) {
      textNodes.push({
        id: `${fileName}::${seg.textIndex}`,
        fileName,
        textIndex: seg.textIndex,
        text: seg.text,
        tag: "",
        styleHints: {},
      });
    }
  }

  const integrityIssues = await validateHwpxArchive(fileBuffer);
  return { textNodes, integrityIssues };
}

export async function validateHwpxArchive(fileBuffer: ArrayBuffer): Promise<string[]> {
  const issues: string[] = [];
  const zip = await JSZip.loadAsync(Buffer.from(fileBuffer));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  for (const required of REQUIRED_ENTRIES) {
    if (!zip.files[required]) issues.push(`필수 엔트리 누락: ${required}`);
  }

  const firstEntry = names[0] ?? "";
  if (firstEntry && firstEntry !== "mimetype") {
    issues.push(`첫 엔트리가 mimetype이 아님: ${firstEntry}`);
  }

  return issues;
}

export async function applyTextEdits(fileBuffer: ArrayBuffer, edits: TextEdit[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(Buffer.from(fileBuffer));
  const names = Object.keys(zip.files);
  const grouped = new Map<string, Map<number, string>>();

  for (const edit of edits) {
    if (!grouped.has(edit.fileName)) grouped.set(edit.fileName, new Map());
    grouped.get(edit.fileName)!.set(edit.textIndex, edit.newText);
  }

  const outEntries: RepackItem[] = [];

  for (const fileName of names) {
    const item = zip.files[fileName];
    if (item.dir) continue;

    if (!grouped.has(fileName) || !isXmlName(fileName)) {
      outEntries.push({ fileName, data: await item.async("uint8array") });
      continue;
    }

    const xmlText = await item.async("string");
    const patched = applyEditsToXmlText(xmlText, grouped.get(fileName)!);
    outEntries.push({ fileName, data: patched });
  }

  return repackHwpx(outEntries);
}

/**
 * {{PLACEHOLDER}} 패턴을 데이터로 치환.
 * 키는 대문자로 정규화됨 (예: {{title}} → {{TITLE}}).
 */
export async function applyPlaceholders(
  fileBuffer: ArrayBuffer,
  placeholders: Record<string, string>
): Promise<Buffer> {
  await validateZipSize(fileBuffer);

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(placeholders)) {
    normalized[key.trim().toUpperCase()] = String(value);
  }

  const zip = await JSZip.loadAsync(Buffer.from(fileBuffer));
  const outEntries: RepackItem[] = [];

  for (const fileName of Object.keys(zip.files)) {
    const item = zip.files[fileName];
    if (item.dir) continue;

    if (!isXmlName(fileName)) {
      outEntries.push({ fileName, data: await item.async("uint8array") });
      continue;
    }

    let xmlText = await item.async("string");
    xmlText = xmlText.replace(/\{\{([A-Z0-9_]+)\}\}/g, (full, token) => {
      if (!(token in normalized)) return full;
      return escapeXml(normalized[token]);
    });

    outEntries.push({ fileName, data: xmlText });
  }

  return repackHwpx(outEntries);
}
