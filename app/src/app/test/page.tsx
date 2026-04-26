"use client";

import { useState } from "react";

/* ── 타입 ── */
type InspectNode = { id: string; fileName: string; textIndex: number; text: string };
type SummaryField = Record<string, string>;
type SummaryItem  = { fileName: string; fields: SummaryField; tokenUsage?: { inputTokens: number; outputTokens: number } };
type BatchResult  = {
  summaries: SummaryItem[];
  errors: Array<{ fileName: string; error: string }>;
  totalTokenUsage: { inputTokens: number; outputTokens: number };
  stats: { total: number; succeeded: number; failed: number };
};

const FIELD_LABELS: Record<string, string> = {
  team: "팀명", period: "보고 주차",
  thisWeek: "금주 실적", nextWeek: "차주 계획",
  issues: "이슈/리스크", keyAchievement: "핵심 성과",
};

/* ── 상태 배지 ── */
function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
      ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

/* ── 섹션 카드 ── */
function Card({ title, children, status }: { title: string; children: React.ReactNode; status?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        {status}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function TestPage() {
  /* ── Step 1: 파일 선택 ── */
  const [file, setFile]               = useState<File | null>(null);
  /* ── Step 2: Inspect ── */
  const [inspecting, setInspecting]   = useState(false);
  const [inspectOk, setInspectOk]     = useState<boolean | null>(null);
  const [nodes, setNodes]             = useState<InspectNode[]>([]);
  const [integrityIssues, setIntegrityIssues] = useState<string[]>([]);
  /* ── Step 3: Batch Summarize ── */
  const [summarizing, setSummarizing] = useState(false);
  const [batchOk, setBatchOk]         = useState<boolean | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  /* ── 파일 선택 핸들러 ── */
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setInspectOk(null); setNodes([]); setIntegrityIssues([]);
    setBatchOk(null); setBatchResult(null);
  }

  /* ── Step 2: /api/inspect 호출 ── */
  async function runInspect() {
    if (!file) return;
    setInspecting(true); setInspectOk(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch("/api/inspect", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "오류");
      setNodes(json.textNodes); setIntegrityIssues(json.integrityIssues);
      setInspectOk(true);
    } catch { setInspectOk(false); }
    finally  { setInspecting(false); }
  }

  /* ── Step 3: /api/batch-summarize 호출 ── */
  async function runSummarize() {
    if (!file) return;
    setSummarizing(true); setBatchOk(null);
    const form = new FormData();
    form.append("files", file);
    form.append("concurrency", "1");
    try {
      const res  = await fetch("/api/batch-summarize", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "오류");
      setBatchResult(json);
      setBatchOk(json.stats.succeeded > 0);
    } catch { setBatchOk(false); }
    finally  { setSummarizing(false); }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">

      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">API 통합 테스트</h1>
        <p className="text-gray-500 text-sm mt-1">
          모델: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">openai/gpt-oss-120b:free</code> via OpenRouter
        </p>
      </div>

      {/* ── STEP 1: 파일 선택 ── */}
      <Card
        title="Step 1 — 테스트 파일 선택"
        status={file ? <Badge ok label={file.name} /> : undefined}
      >
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300
          rounded-xl p-8 cursor-pointer hover:border-blue-400 transition-colors bg-gray-50">
          <span className="text-4xl mb-2">📄</span>
          <span className="text-sm text-gray-500">
            {file ? file.name : ".hwpx 파일을 선택하세요"}
          </span>
          {file && (
            <span className="text-xs text-gray-400 mt-1">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          )}
          <input type="file" accept=".hwpx" onChange={handleFile} className="hidden" />
        </label>
        {!file && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            테스트용 파일이 없으면{" "}
            <code className="bg-gray-100 px-1 rounded">
              node scripts/create-test-hwpx.mjs
            </code>
            {" "}실행 후 <code className="bg-gray-100 px-1 rounded">scripts/test-sample.hwpx</code>를 사용하세요
          </p>
        )}
      </Card>

      {/* ── STEP 2: Inspect ── */}
      <Card
        title="Step 2 — /api/inspect · HWPX 텍스트 파싱"
        status={inspectOk !== null ? <Badge ok={inspectOk} label={inspectOk ? "파싱 성공" : "파싱 실패"} /> : undefined}
      >
        <button
          onClick={runInspect}
          disabled={!file || inspecting}
          className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium
            hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          {inspecting ? "파싱 중…" : "HWPX 텍스트 노드 추출 실행"}
        </button>

        {nodes.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500">총 <strong>{nodes.length}</strong>개 텍스트 노드 추출됨</p>
            {integrityIssues.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                ⚠ 무결성 이슈: {integrityIssues.join(" / ")}
              </div>
            )}
            <div className="overflow-auto max-h-48 rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 w-16">인덱스</th>
                    <th className="px-3 py-2 text-left text-gray-500">텍스트</th>
                    <th className="px-3 py-2 text-left text-gray-500">파일</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n) => (
                    <tr key={n.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-center text-gray-400">{n.textIndex}</td>
                      <td className="px-3 py-1.5 font-medium">{n.text}</td>
                      <td className="px-3 py-1.5 text-gray-400 truncate max-w-[150px]">{n.fileName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* ── STEP 3: AI 요약 ── */}
      <Card
        title="Step 3 — /api/batch-summarize · AI 요약"
        status={batchOk !== null ? <Badge ok={batchOk} label={batchOk ? "요약 성공" : "요약 실패"} /> : undefined}
      >
        <button
          onClick={runSummarize}
          disabled={!file || summarizing}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium
            hover:bg-blue-700 disabled:opacity-40 transition"
        >
          {summarizing ? "AI 요약 중… (약 10~30초)" : "AI 텍스트 인식 & 요약 실행"}
        </button>

        {batchResult && (
          <div className="mt-4 space-y-3">
            {/* 통계 */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "전체", value: batchResult.stats.total, color: "" },
                { label: "성공", value: batchResult.stats.succeeded, color: "text-green-600" },
                { label: "실패", value: batchResult.stats.failed,    color: "text-red-500"   },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-lg py-2">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 토큰 사용량 */}
            <div className="flex gap-4 text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2">
              <span>입력 토큰: <strong className="text-gray-600">{batchResult.totalTokenUsage.inputTokens.toLocaleString()}</strong></span>
              <span>출력 토큰: <strong className="text-gray-600">{batchResult.totalTokenUsage.outputTokens.toLocaleString()}</strong></span>
              <span className="text-green-600 font-medium">무료 모델 (비용: $0)</span>
            </div>

            {/* 오류 */}
            {batchResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700">
                {batchResult.errors.map((e, i) => (
                  <p key={i}><strong>{e.fileName}</strong>: {e.error}</p>
                ))}
              </div>
            )}

            {/* 요약 결과 */}
            {batchResult.summaries.map((s, i) => (
              <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-indigo-50 px-4 py-3 flex justify-between items-center">
                  <span className="font-medium text-indigo-800 text-sm">{s.fileName}</span>
                  {s.tokenUsage && (
                    <span className="text-xs text-indigo-500">
                      토큰: {s.tokenUsage.inputTokens} → {s.tokenUsage.outputTokens}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-50">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <div key={key} className="px-4 py-3 grid grid-cols-4 gap-2">
                      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-0.5 col-span-1">
                        {label}
                      </dt>
                      <dd className="text-sm text-gray-800 whitespace-pre-line col-span-3">
                        {s.fields[key] ?? <span className="text-gray-300">-</span>}
                      </dd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── API 엔드포인트 요약 ── */}
      <Card title="API 엔드포인트 현황">
        <div className="space-y-2 text-sm">
          {[
            { method: "POST", path: "/api/inspect",         desc: "HWPX 텍스트 노드 추출", color: "bg-blue-100 text-blue-700" },
            { method: "POST", path: "/api/batch-summarize", desc: "AI 일괄 요약 (최대 5개)", color: "bg-blue-100 text-blue-700" },
            { method: "POST", path: "/api/report",          desc: "HWPX 보고서 생성 (템플릿 필요)", color: "bg-blue-100 text-blue-700" },
          ].map((ep) => (
            <div key={ep.path} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${ep.color}`}>{ep.method}</span>
              <code className="text-xs text-gray-700 flex-1">{ep.path}</code>
              <span className="text-xs text-gray-400">{ep.desc}</span>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
