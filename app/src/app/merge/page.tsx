"use client";

import { useState } from "react";

type Step = "idle" | "ready" | "processing" | "done" | "error";

export default function MergePage() {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [step,        setStep]        = useState<Step>("idle");
  const [error,       setError]       = useState<string | null>(null);
  const [progress,    setProgress]    = useState("");
  const [outName,     setOutName]     = useState("");

  /* ── 파일 선택 ── */
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".hwpx")
    );
    setSourceFiles((prev) => [...prev, ...added].slice(0, 5));
    setStep("ready");
    setError(null);
  };

  const removeFile = (i: number) => {
    setSourceFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      if (next.length === 0) setStep("idle");
      return next;
    });
  };

  /* ── 드래그앤드롭 ── */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  /* ── 보고서 생성 ── */
  const handleSubmit = async () => {
    if (sourceFiles.length === 0) return;

    setStep("processing");
    setError(null);
    setProgress("소스 파일 텍스트 추출 중…");

    const form = new FormData();
    sourceFiles.forEach((f) => form.append("sources", f));

    try {
      setProgress("AI가 내용을 분석하고 주간보고 형식으로 정리 중… (10~30초 소요)");

      const res = await fetch("/api/template-fill", { method: "POST", body: form });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "서버 오류");
      }

      /* Content-Disposition 에서 파일명 추출 */
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch   = disposition.match(/filename\*?=(?:UTF-8'')?([^;\r\n]+)/i);
      const fileName    = nameMatch
        ? decodeURIComponent(nameMatch[1].replace(/"/g, ""))
        : `주간보고_${new Date().toISOString().slice(0, 10)}.hwpx`;

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = fileName;
      // DOM에 추가해야 Firefox 등 일부 브라우저에서도 동작
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 다운로드가 시작된 후 URL 해제 (즉시 해제 시 다운로드 실패)
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      setOutName(fileName);
      setStep("done");
      setProgress(`"${fileName}" 다운로드 완료!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
      setStep("error");
    }
  };

  const canSubmit = sourceFiles.length > 0 && step !== "processing";

  /* ── 단계 레이블 ── */
  const stepNum =
    step === "idle"       ? 1 :
    step === "ready"      ? 2 :
    step === "processing" ? 3 :
    step === "done"       ? 4 : 2;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">주간보고 자동 정리</h1>
        <p className="text-gray-500 text-sm mt-1">
          소스 HWPX 파일을 올리면 AI가 표준 주간보고 형식으로 자동 정리하고 새 파일로 만들어줍니다.
          템플릿 작업은 필요 없습니다.
        </p>
      </div>

      {/* 진행 단계 표시 */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {[
          { n: 1, label: "파일 선택" },
          { n: 2, label: "AI 분석" },
          { n: 3, label: "HWPX 다운로드" },
        ].map((s, i, arr) => (
          <span key={s.n} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${stepNum >= s.n ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}
            >
              {step === "done" && s.n <= 3 ? "✓" : s.n}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
            {i < arr.length - 1 && <span className="text-gray-200">→</span>}
          </span>
        ))}
      </div>

      {/* ── 파일 업로드 영역 ── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">소스 HWPX 파일 선택 (최대 5개)</h2>
          {sourceFiles.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {sourceFiles.length}개 선택됨
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* 드래그 영역 */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center
              hover:border-blue-300 transition-colors bg-gray-50"
          >
            <p className="text-4xl mb-3">📂</p>
            <p className="text-gray-600 text-sm font-medium mb-1">
              업무 내용이 담긴 .hwpx 파일을 드래그하거나
            </p>
            <label
              className="cursor-pointer inline-block bg-blue-600 text-white
                rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 transition mt-1"
            >
              파일 선택
              <input
                type="file"
                accept=".hwpx"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-400 mt-3">
              여러 파일을 한번에 선택 가능 · 최대 5개
            </p>
          </div>

          {/* 선택된 파일 목록 */}
          {sourceFiles.length > 0 && (
            <ul className="space-y-1.5">
              {sourceFiles.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-blue-400 shrink-0">📄</span>
                    <span className="truncate text-gray-700">{f.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-gray-300 hover:text-red-400 transition ml-2 shrink-0"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* AI 처리 내용 안내 카드 */}
      <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-5">
        <h3 className="font-semibold text-indigo-900 mb-3 text-sm">🤖 AI가 자동으로 정리하는 항목</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { icon: "🏢", label: "팀명 / 부서명" },
            { icon: "📅", label: "보고 주차" },
            { icon: "📆", label: "보고일" },
            { icon: "✅", label: "금주 실적" },
            { icon: "📋", label: "차주 계획" },
            { icon: "⚠️", label: "이슈 및 리스크" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs text-gray-700
                border border-indigo-100 shadow-sm"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-indigo-500 mt-3">
          소스 파일에서 위 항목을 추출하여 표준 주간보고 HWPX 파일로 생성합니다.
        </p>
      </section>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 whitespace-pre-line">
          ❌ {error}
        </div>
      )}

      {/* 완료 메시지 */}
      {step === "done" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">{progress}</p>
            <p className="text-green-600 text-xs mt-0.5">
              한글 오피스에서 열어 내용을 확인하고 필요 시 수정하세요.
            </p>
          </div>
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-3.5 rounded-xl font-semibold text-white transition
          bg-gradient-to-r from-blue-600 to-indigo-600
          hover:from-blue-700 hover:to-indigo-700
          disabled:opacity-40 disabled:cursor-not-allowed text-base"
      >
        {step === "processing" ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            {progress}
          </span>
        ) : step === "done" ? (
          "다시 생성하기"
        ) : (
          "AI로 주간보고 자동 정리 → HWPX 다운로드"
        )}
      </button>

      {/* 도움말 */}
      <details className="text-sm text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700 select-none">
          💡 사용 방법 안내
        </summary>
        <div className="mt-3 bg-gray-50 rounded-xl p-4 text-xs leading-relaxed space-y-2">
          <p>
            <strong>1.</strong> 팀원들이 작성한 주간 업무보고 <code className="bg-white px-1 rounded border">.hwpx</code> 파일을 최대 5개 업로드합니다.
          </p>
          <p>
            <strong>2.</strong> AI가 파일에서 팀명·실적·계획·이슈 등을 자동으로 추출합니다.
          </p>
          <p>
            <strong>3.</strong> 경영현안회의 표준 형식의 <strong>통합 주간보고 HWPX</strong>가 자동으로 다운로드됩니다.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
            <p className="text-amber-700 font-semibold">⚠ 참고사항</p>
            <p className="text-amber-600 mt-1">
              AI가 추출한 내용이 부정확할 수 있습니다. 다운로드 후 한글 오피스에서 내용을 검토하고 필요 시 수정해주세요.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
