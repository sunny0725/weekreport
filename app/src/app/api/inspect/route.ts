/**
 * HWPX 템플릿 내 텍스트 노드 목록 반환 API
 * 용도: 어떤 인덱스에 어떤 텍스트가 있는지 확인 → 플레이스홀더 삽입 위치 파악
 */
import { NextRequest, NextResponse } from "next/server";
import { inspectHwpx } from "@/lib/hwpx";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const { textNodes, integrityIssues } = await inspectHwpx(arrayBuffer);

    return NextResponse.json({ textNodes, integrityIssues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
