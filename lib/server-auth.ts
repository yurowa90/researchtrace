import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";

export async function getRequestUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (user) return user;

  if (process.env.NODE_ENV !== "production") {
    return {
      userId: "local-demo-teacher",
      email: "teacher@example.school",
      displayName: "담임 교사",
      fullName: "담임 교사",
    };
  }

  return null;
}
