/**
 * /api/template-fill 엔드-투-엔드 테스트
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";

const templateBytes = await fs.readFile(path.join(__dirname, "test-template.hwpx"));
const sourceBytes   = await fs.readFile(path.join(__dirname, "test-sample.hwpx"));

const form = new FormData();
form.append("template", new Blob([templateBytes], { type: "application/octet-stream" }), "test-template.hwpx");
form.append("sources",  new Blob([sourceBytes],  { type: "application/octet-stream" }), "test-sample.hwpx");

console.log("📤 /api/template-fill 요청 중…");
const start = Date.now();
const res = await fetch(`${BASE}/api/template-fill`, { method: "POST", body: form });
console.log(`   소요: ${Date.now() - start}ms  /  HTTP ${res.status}`);

if (!res.ok) {
  const j = await res.json();
  console.error("❌ 실패:", j.error);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const outPath = path.join(__dirname, "test-output-filled.hwpx");
await fs.writeFile(outPath, buf);
console.log(`✅ 결과 HWPX 저장: ${outPath}  (${(buf.length / 1024).toFixed(1)} KB)`);

// 결과 HWPX 안의 텍스트 확인
import JSZip from "jszip";
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("Contents/section0.xml").async("string");
const texts = [...xml.matchAll(/<[a-z]+:t(?:\s[^>]*)?>([^<]+)<\/[a-z]+:t>/g)].map(m => m[1]);
console.log("\n📄 출력 파일 내용:");
texts.forEach((t, i) => console.log(`   [${i}] ${t.slice(0, 80)}`));
