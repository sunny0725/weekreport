/**
 * 에러 위치 진단 스크립트
 * JSZip 직접 호출로 HWPX 파싱 테스트
 */
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hwpxPath = path.join(__dirname, "test-sample.hwpx");

async function main() {
  console.log("1. 파일 읽기...");
  const rawBuf = await fs.readFile(hwpxPath);
  console.log(`   파일 크기: ${rawBuf.length} bytes`);
  console.log(`   첫 4바이트: ${[...rawBuf.slice(0,4)].map(b => b.toString(16).padStart(2,'0')).join(' ')}`);

  console.log("\n2. JSZip.loadAsync(Buffer) 시도...");
  try {
    const zip = await JSZip.loadAsync(rawBuf);
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    console.log(`   ✅ 성공! 엔트리 ${names.length}개: ${names.join(', ')}`);

    console.log("\n3. section0.xml 텍스트 추출...");
    const sec = zip.file("Contents/section0.xml");
    if (!sec) throw new Error("section0.xml 없음");
    const xml = await sec.async("string");
    console.log(`   XML 길이: ${xml.length}자`);

    // hp:t 노드 추출
    const matches = [...xml.matchAll(/<[a-z]+:t(?:\s[^>]*)?>([^<]*)<\/[a-z]+:t>/g)];
    console.log(`   텍스트 노드 ${matches.length}개:`);
    matches.forEach((m, i) => console.log(`     [${i}] "${m[1]}"`));
  } catch (e) {
    console.error(`   ❌ 실패: ${e.message}`);
    console.error(e);
  }

  console.log("\n4. ArrayBuffer 변환 후 JSZip.loadAsync 시도...");
  try {
    const arrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
    const zip = await JSZip.loadAsync(arrayBuffer);
    console.log(`   ✅ ArrayBuffer 방식 성공!`);
  } catch (e) {
    console.error(`   ❌ ArrayBuffer 방식 실패: ${e.message}`);
  }
}

main().catch(console.error);
