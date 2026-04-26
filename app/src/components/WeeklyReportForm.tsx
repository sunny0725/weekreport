"use client";

import { useState } from "react";

type FormState = {
  teamName: string;
  author: string;
  weekLabel: string;
  reportDate: string;
  thisWeekWork: string;
  nextWeekPlan: string;
  issues: string;
  kpiTarget: string;
  kpiActual: string;
};

const initialState: FormState = {
  teamName: "AI미래전략센터",
  author: "",
  weekLabel: "",
  reportDate: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
  thisWeekWork: "",
  nextWeekPlan: "",
  issues: "",
  kpiTarget: "",
  kpiActual: "",
};

export default function WeeklyReportForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function splitLines(text: string): string[] {
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        teamName: form.teamName,
        author: form.author,
        weekLabel: form.weekLabel,
        reportDate: form.reportDate,
        thisWeekWork: splitLines(form.thisWeekWork),
        nextWeekPlan: splitLines(form.nextWeekPlan),
        issues: splitLines(form.issues),
        kpiTarget: form.kpiTarget ? Number(form.kpiTarget) : undefined,
        kpiActual: form.kpiActual ? Number(form.kpiActual) : undefined,
      };

      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "보고서 생성 실패");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.reportDate}_${form.weekLabel}_경영현안회의_${form.teamName}.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold">주간 업무보고 자동 생성</h1>

      <section className="grid grid-cols-2 gap-4">
        <Field label="팀명" required>
          <input
            className="input"
            value={form.teamName}
            onChange={set("teamName")}
            required
          />
        </Field>
        <Field label="작성자" required>
          <input
            className="input"
            value={form.author}
            onChange={set("author")}
            required
          />
        </Field>
        <Field label="주차 (예: 1월 3주)" required>
          <input
            className="input"
            value={form.weekLabel}
            onChange={set("weekLabel")}
            placeholder="1월 3주"
            required
          />
        </Field>
        <Field label="보고 날짜">
          <input
            className="input"
            value={form.reportDate}
            onChange={set("reportDate")}
          />
        </Field>
      </section>

      <Field label="금주 실적 (줄바꿈으로 항목 구분)" required>
        <textarea
          className="input h-32"
          value={form.thisWeekWork}
          onChange={set("thisWeekWork")}
          placeholder={"정책연구 보고서 초안 작성 완료\nAI 활용 현황 조사 착수"}
          required
        />
      </Field>

      <Field label="차주 계획 (줄바꿈으로 항목 구분)" required>
        <textarea
          className="input h-32"
          value={form.nextWeekPlan}
          onChange={set("nextWeekPlan")}
          placeholder={"보고서 검토 회의 참석\n외부 전문가 인터뷰 진행"}
          required
        />
      </Field>

      <Field label="이슈 / 리스크 (줄바꿈으로 항목 구분)">
        <textarea
          className="input h-24"
          value={form.issues}
          onChange={set("issues")}
          placeholder={"데이터 수집 지연 (외부기관 협조 필요)\n예산 집행 일정 조정 필요"}
        />
      </Field>

      <section className="grid grid-cols-2 gap-4">
        <Field label="KPI 목표">
          <input
            type="number"
            className="input"
            value={form.kpiTarget}
            onChange={set("kpiTarget")}
            placeholder="100"
          />
        </Field>
        <Field label="KPI 실적">
          <input
            type="number"
            className="input"
            value={form.kpiActual}
            onChange={set("kpiActual")}
            placeholder="85"
          />
        </Field>
      </section>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {loading ? "AI 요약 중 · HWPX 생성 중…" : "보고서 생성 (.hwpx 다운로드)"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
