import { LogoutButton } from "./logout-button";
import { Shell } from "./shell";

// 管理ホーム(ダッシュボードは #30)。認証はルートグループの layout が行う
export default function Home() {
  return (
    <Shell title="ダッシュボード">
      <main className="amain-wrap">
        <p>ログインしました。ダッシュボードは順次追加されます。</p>
        <LogoutButton />
      </main>
    </Shell>
  );
}
