"use client";

import { useState } from "react";

type TextNode = {
  id: string;
  fileName: string;
  textIndex: number;
  text: string;
};

export default function InspectPage() {
  const [nodes, setNodes] = useState<TextNode[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/inspect", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNodes(json.textNodes);
      setIssues(json.integrityIssues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">HWPX 템플릿 검사</h1>
      <p className="text-gray-600 text-sm">
        .hwpx 파일을 업로드하면 내부 텍스트 노드와 인덱스를 확인할 수 있습니다.
        플레이스홀더 삽입 위치를 파악하는 데 사용하세요.
      </p>

      <input
        type="file"
        accept=".hwpx"
        onChange={handleFile}
        className="block border border-gray-300 rounded p-2"
      />

      {loading && <p className="text-blue-600">분석 중…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {issues.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-3">
          <p className="font-semibold text-yellow-800 mb-1">무결성 경고</p>
          {issues.map((issue, i) => (
            <p key={i} className="text-sm text-yellow-700">{issue}</p>
          ))}
        </div>
      )}

      {nodes.length > 0 && (
        <div className="overflow-auto">
          <p className="text-sm text-gray-500 mb-2">총 {nodes.length}개 텍스트 노드</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-2 text-left">파일</th>
                <th className="border px-3 py-2 text-left w-16">인덱스</th>
                <th className="border px-3 py-2 text-left">텍스트</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-1 text-gray-500 text-xs">{node.fileName}</td>
                  <td className="border px-3 py-1 text-center">{node.textIndex}</td>
                  <td className="border px-3 py-1">{node.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
