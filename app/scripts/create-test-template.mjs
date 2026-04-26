/**
 * 플레이스홀더가 포함된 테스트 템플릿 HWPX 생성
 * 실행: node scripts/create-test-template.mjs
 */
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_PARAGRAPHS = [
  "경영현안회의 주간업무보고",
  "보고 팀: {{TEAM_NAME}}",
  "보고 주차: {{WEEK_LABEL}}",
  "1. 금주 실적",
  "{{THIS_WEEK}}",
  "2. 차주 계획",
  "{{NEXT_WEEK}}",
  "3. 이슈 및 리스크",
  "{{ISSUES}}",
];

function makeSectionXml(paragraphs) {
  const pNodes = paragraphs.map((text, i) => `
    <hp:p id="${2000 + i}">
      <hp:pPr><hp:pStyle paraPrIDRef="0"/></hp:pPr>
      <hp:run>
        <hp:runPr/>
        <hp:t>${text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</hp:t>
      </hp:run>
    </hp:p>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hsp:secPr xmlns:hsp="http://www.hancom.co.kr/hwpml/2011/paragraph"
           xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:sec>${pNodes}
  </hp:sec>
</hsp:secPr>`;
}

const zip = new JSZip();
zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
zip.file("version.xml", `<?xml version="1.0" encoding="UTF-8"?><ver:versionsupport xmlns:ver="http://www.hancom.co.kr/hwpml/2011/version"><ver:version>1.3</ver:version></ver:versionsupport>`);
zip.file("Contents/content.hpf", `<?xml version="1.0"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf"><opf:manifest><opf:item id="section0" href="section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="section0"/></opf:spine></opf:package>`);
zip.file("Contents/section0.xml", makeSectionXml(TEMPLATE_PARAGRAPHS));

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
const outPath = path.join(__dirname, "test-template.hwpx");
await fs.writeFile(outPath, buf);

console.log(`✅ 템플릿 HWPX 생성: ${outPath}`);
console.log(`   플레이스홀더: {{TEAM_NAME}}, {{WEEK_LABEL}}, {{THIS_WEEK}}, {{NEXT_WEEK}}, {{ISSUES}}`);
