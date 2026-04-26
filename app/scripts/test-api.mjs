/**
 * API 직접 테스트 스크립트 (Node.js fetch — curl 인코딩 문제 우회)
 * 실행: node scripts/test-api.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:3000";

async function testInspect() {
  console.log("━━━ /api/inspect 테스트 ━━━");
  const fileBytes = await fs.readFile(path.join(__dirname, "test-sample.hwpx"));

  const form = new FormData();
  form.append("file", new Blob([fileBytes], { type: "application/octet-stream" }), "test-sample.hwpx");

  const res = await fetch(`${BASE_URL}/api/inspect`, { method: "POST", body: form });
  const json = await res.json();

  if (json.error) {
    console.error("❌ 오류:", json.error);
    return false;
  }

  console.log(`✅ 텍스트 노드 ${json.textNodes.length}개 추출 성공`);
  console.log(`   무결성 이슈: ${json.integrityIssues.length === 0 ? "없음" : json.integrityIssues.join(", ")}`);
  json.textNodes.slice(0, 5).forEach(n => console.log(`   [${n.textIndex}] ${n.text}`));
  return true;
}

async function testBatchSummarize() {
  console.log("\n━━━ /api/batch-summarize 테스트 (Gemma 3 27B) ━━━");
  const fileBytes = await fs.readFile(path.join(__dirname, "test-sample.hwpx"));

  const form = new FormData();
  form.append("files", new Blob([fileBytes], { type: "application/octet-stream" }), "test-sample.hwpx");
  form.append("concurrency", "1");

  console.log("   AI 요약 요청 중... (최대 60초 소요)");
  const res = await fetch(`${BASE_URL}/api/batch-summarize`, { method: "POST", body: form });
  const json = await res.json();

  if (json.errors?.length > 0) {
    console.error("❌ 오류 파일:");
    json.errors.forEach(e => console.error(`   ${e.fileName}: ${e.error}`));
  }

  if (json.summaries?.length > 0) {
    console.log(`✅ 요약 성공! (토큰: 입력 ${json.totalTokenUsage.inputTokens} / 출력 ${json.totalTokenUsage.outputTokens})`);
    const s = json.summaries[0];
    console.log(`\n   파일: ${s.fileName}`);
    Object.entries(s.fields).forEach(([k, v]) => {
      console.log(`\n   [${k}]`);
      console.log(`   ${String(v).slice(0, 120)}`);
    });
  }

  console.log(`\n   통계: 전체 ${json.stats.total} / 성공 ${json.stats.succeeded} / 실패 ${json.stats.failed}`);
}

async function main() {
  const inspectOk = await testInspect();
  if (inspectOk) await testBatchSummarize();
}

main().catch(e => { console.error(e); process.exit(1); });
