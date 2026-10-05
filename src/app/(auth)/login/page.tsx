import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Entrar · LifeOS" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl } = await searchParams;
  return <LoginForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />;
}
