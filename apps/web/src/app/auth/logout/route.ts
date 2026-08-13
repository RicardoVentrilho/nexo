import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../slices/identity/session";

export async function GET(request: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/auth/login", request.url));
}
