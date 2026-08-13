import { cookies } from "next/headers";

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get("nexo_access_token")?.value;
}

export async function setSessionCookie(accessToken: string): Promise<void> {
  (await cookies()).set("nexo_access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete("nexo_access_token");
}
