import { NextRequest, NextResponse } from "next/server";
import { generateHwpxReport, WeeklyReportInput } from "@/lib/report-generator";

export async function POST(req: NextRequest) {
  try {
    const body: WeeklyReportInput = await req.json();

    if (!body.teamName || !body.author || !body.weekLabel) {
      return NextResponse.json(
        { error: "teamName, author, weekLabel 은 필수입니다." },
        { status: 400 }
      );
    }

    const hwpxBuffer = await generateHwpxReport(body);

    const filename = encodeURIComponent(
      `${body.reportDate}_${body.weekLabel}_경영현안회의_${body.teamName}.hwpx`
    );

    return new NextResponse(hwpxBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/hwpx",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
