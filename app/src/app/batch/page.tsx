"use client";

import { useState, useCallback } from "react";

type SummaryItem = {
  fileName: string;
  fields: Record<string, string>;
};

type ErrorItem = {
  fileName: string;
  error: string;
};

type BatchResult = {
  summaries: SummaryItem[];
  errors: ErrorItem[];
  totalTokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  stats: { total: number; succeeded: number; failed: number };
};

const FIELD_LABELS: Record<string, string> = {
  team: "팀명",
  period: "보고 주차",
  thisWeek: "금주 실적",
  nextWeek: "차주 계획",
  issues: "이슈/리스크",
  keyAchievement: "핵심 성과",
};

export default function BatchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".hwpx")
    );
    setFiles((prev) => {
      const combined = [...prev, ...dropped];
      return combined.slice(0, 5); // 최대 5개
    });
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter((f) =>
      f.name.endsWith(".hwpx")
    );
    setFiles((prev) => [...prev, ...selected].slice(0, 5));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(`${files.length}개 파일 업로드 중…`);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("concurrency", "4");

      setProgress("AI 요약 중… (파일당 약 10~5초 소요)");

      const res = await fetch("/api/batch-summarize", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "요약 실패");

      setResult(json);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    const fieldKeys = Object.keys(FIELD_LABELS);
    const header = ["파일명", ...fieldKeys.map((k) => FIELD_LABELS[k])];
    const rows = result.summaries.map((s) => [
      s.fileName,
      ...fieldKeys.map((k) => (s.fields[k] ?? "").replaceAll(",", " ")),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주간보고_일괄요약_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">주간보고 일괄 요약</h1>
        <p className="text-gray-500 text-sm mt-1">
          HWPX 파일을 최대 5개 업로드하면 AI가 팀별 업무 내용을 자동으로 요약합니다.
        </p>
      </div>

      {/* 파일 드롭존 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors"
      >
        <p className="text-gray-500 mb-3">
          .hwpx 파일을 여기에 드래그하거나
        </p>
        <label className="cursor-pointer inline-block bg-blue-50 text-blue-700 border border-blue-50 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-100 transition">
          파일 선택 (최대 5개)
          <input
            type="file"
            accept=".hwpx"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-400 mt-2">
          구형 .hwp 파일은 한글 오피스에서 .hwpx로 저장 후 업로드하세요
        </p>
      </div>

      {/* 선택된 파일 목록 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-gray-700">
              선택된 파일 ({files.length}/5)
            </p>
            <button
              onClick={() => setFiles([])}
              className="text-xs text-red-500 hover:underline"
            >
              전체 삭제
            </button>
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex justify-between items-center text-sm bg-gray-50 rounded px-3 py-1.5"
              >
                <span className="truncate text-gray-700">{f.name}</span>
                <span className="text-gray-400 text-xs ml-2 shrink-0">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-3 text-gray-400 hover:text-red-500 shrink-0"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={loading || !files.length}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
      >
        {loading ? progress || "처리 중…" : `${files.length}개 파일 일괄 요약 시작`}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-50 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-6">
          {/* 통계 */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "전체", value: result.stats.total },
              { label: "성공", value: result.stats.succeeded, color: "text-green-600" },
              { label: "실패", value: result.stats.failed, color: "text-red-600" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                <p className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* 토큰 사용량 */}
          <div className="text-xs text-gray-400 bg-gray-50 rounded px-4 py-2 flex gap-4">
            <span>입력: {result.totalTokenUsage.inputTokens.toLocaleString()} 토큰</span>
            <span>출력: {result.totalTokenUsage.outputTokens.toLocaleString()} 토큰</span>
          </div>

          {/* 오류 목록 */}
          {result.errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-50 rounded-lg p-4 space-y-1">
              <p className="font-medium text-yellow-800 text-sm">처리 실패 파일</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-yellow-700">
                  {e.fileName}: {e.error}
                </p>
              ))}
            </div>
          )}

          {/* 요약 결과 + CSV 다운로드 */}
          {result.summaries.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-gray-800">요약 결과</h2>
                <button
                  onClick={downloadCsv}
                  className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition"
                >
                  CSV 다운로드
                </button>
              </div>

              {result.summaries.map((s, i) => (
                <details
                  key={i}
                  className="border border-gray-50 rounded-lg overflow-hidden"
                  open={i === 0}
                >
                  <summary className="bg-gray-50 px-4 py-3 cursor-pointer font-medium text-sm flex justify-between items-center">
                    <span>{s.fileName}</span>
                    <span className="text-gray-400 text-xs">{s.fields.team ?? ""}</span>
                  </summary>
                  <div className="p-4 space-y-3">
                    {Object.entries(FIELD_LABELS).map(([key, label]) => (
                      <div key={key}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {label}
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-line mt-0.5">
                          {s.fields[key] ?? "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
