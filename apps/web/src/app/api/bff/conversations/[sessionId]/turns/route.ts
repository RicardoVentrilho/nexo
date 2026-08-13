import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const token = (await cookies()).get("nexo_access_token")?.value;
  if (!token) return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });

  const api = process.env.API_INTERNAL_URL ?? "http://api:8080";
  const response = await fetch(`${api}/v1/conversations/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: await request.text()
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  });
}
