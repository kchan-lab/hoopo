import { redirect } from "next/navigation";
import { getGuardianSession } from "../../lib/session";
import { RegisterForm } from "./register-form";

// 初回登録(REQUIREMENTS §3・§4.2-2。ワイヤー2・3)。未ログインはホーム(自動ログイン)へ戻す
export default async function RegisterPage() {
  if (!(await getGuardianSession())) redirect("/");
  return <RegisterForm />;
}
