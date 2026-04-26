/**
 * 테스트용 최소 HWPX 파일 생성 스크립트
 * 실행: node scripts/create-test-hwpx.mjs
 *
 * 생성 결과: scripts/test-sample.hwpx
 * OWPML 최소 구조: mimetype + version.xml + content.hpf + section0.xml
 */
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 실제 주간보고 내용을 모사한 샘플 텍스트 (hp:t 노드에 직접 삽입)
const SAMPLE_PARAGRAPHS = [
  "AI미래전략센터",
  "2024년 1월 3주 경영현안회의",
  "1. 금주 실적",
  "[GDX 2023-5] 데이터 혁신 성숙도 측정 및 진단 모형 개발 추진",
  "인공지능(AI) 정책 및 법·제도 현황 조사 완료 (1.11)",
  "2024년도 디지털화정책추진계획 수립 착수 (1.10)",
  "2. 차주 계획",
  "데이터 혁신 성숙도 측정 도구 초안 작성 예정 (~1.17)",
  "AI 전략 보고서 2차 검토 회의 참석 예정 (1.18)",
  "외부 전문가 자문단 구성 협의 진행 예정",
  "3. 이슈 및 리스크",
  "외부기관 데이터 수집 지연으로 일정 조정 필요",
  "예산 집행 계획 변경에 따른 사업 재조정 검토 중",
];

function makeSectionXml(paragraphs) {
  const pNodes = paragraphs
    .map(
      (text, i) => `
    <hp:p id="${1000 + i}">
      <hp:pPr>
        <hp:pStyle paraPrIDRef="0"/>
      </hp:pPr>
      <hp:run>
        <hp:runPr/>
        <hp:t>${text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</hp:t>
      </hp:run>
    </hp:p>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hsp:secPr xmlns:hsp="http://www.hancom.co.kr/hwpml/2011/paragraph"
           xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:sec>${pNodes}
  </hp:sec>
</hsp:secPr>`;
}

async function main() {
  const zip = new JSZip();

  // 1. mimetype — 반드시 첫 번째, STORE 압축
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });

  // 2. version.xml
  zip.file(
    "version.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ver:versionsupport xmlns:ver="http://www.hancom.co.kr/hwpml/2011/version">
  <ver:version>1.3</ver:version>
</ver:versionsupport>`
  );

  // 3. Contents/content.hpf (목차)
  zip.file(
    "Contents/content.hpf",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf">
  <opf:manifest>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`
  );

  // 4. Contents/section0.xml (본문)
  zip.file("Contents/section0.xml", makeSectionXml(SAMPLE_PARAGRAPHS));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const outPath = path.join(__dirname, "test-sample.hwpx");
  await fs.writeFile(outPath, buf);

  console.log(`✅ 테스트 HWPX 생성 완료: ${outPath}`);
  console.log(`   단락 수: ${SAMPLE_PARAGRAPHS.length}개`);
  console.log(`   파일 크기: ${(buf.length / 1024).toFixed(1)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
