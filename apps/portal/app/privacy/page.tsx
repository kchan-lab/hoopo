import type { Metadata } from "next";
import Link from "next/link";

// プライバシーポリシー(REQUIREMENTS §9「プライバシーポリシーをアプリ内に掲示」)。
// 説明と同意は運用開始前に取るため、登録前・LIFF 外からも読めるようログイン不要の公開ページにする
// (privacy-policy/plan.md 設計判断1)。個人情報は含まないので静的配信で問題ない。
// 文面の正は docs/PRIVACY_POLICY.md。Markdown レンダラの依存を増やさず静的 JSX で持つので、
// どちらかを直したら必ずもう一方も同じ内容に更新する(plan.md 方針)

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "プライバシーポリシー − hoopo",
};

const LAST_UPDATED = "2026-09-07";

export default function PrivacyPage() {
  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">プライバシーポリシー</h1>
      </header>
      <main className="sc-body">
        <p className="help">最終更新日: {LAST_UPDATED}</p>
        <p className="help">
          「hoopo −
          ミニバスれんらくポータル」(以下このアプリ)で、SKC粉浜・北粉浜ミニバスケットボールの保護者のみなさまからお預かりする情報の扱いをまとめました。
        </p>

        <section className="card legal">
          <h2 className="ttl">運営者</h2>
          <p>
            SKC粉浜・北粉浜ミニバスケットボールのコーチが、個人で無償で運営しています。会社が提供するサービスではありません。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">取得する情報</h2>
          <p>このアプリが保存するのは、次の情報だけです。</p>
          <ul>
            <li>LINE ユーザー ID(暗号化して保存します)</li>
            <li>お子さんの名前・呼び名(ひらがな)・学年・性別</li>
            <li>コーチへの伝達事項</li>
            <li>参加できる曜日・時間帯</li>
            <li>お子さんとの続柄(父・母・祖父母・その他)</li>
          </ul>
          <p>
            このほかに、アプリを使う中で入力された記録(参加予定の回答とそのコメント、月謝の「済・未」)を保存します。
          </p>
          <p>
            LINE ログインやチームのグループから受け取ることがあっても、
            <b>保存しない</b>
            情報があります。
          </p>
          <ul>
            <li>LINE の表示名</li>
            <li>プロフィール画像</li>
            <li>トークの内容</li>
            <li>電話番号</li>
          </ul>
          <p>
            メールアドレス・パスワード・住所・生年月日は、保護者のみなさまにはお聞きしません。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">利用目的</h2>
          <p>
            練習日程・参加予定(出欠)・月謝・お知らせをチーム内で連絡するためだけに使います。広告や外部への名簿提供には使いません。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">保管先</h2>
          <p>
            データベースは Supabase、アプリの動作は Vercel
            を使っています。いずれも東京リージョンです。LINE ユーザー ID
            は暗号化して保存し、そのままの形では保存しません。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">第三者提供</h2>
          <p>
            第三者へ提供することはありません。LINE への送信は、チームの LINE
            グループ宛ての連絡(予定表・お知らせ・参加予定のリマインド)だけです。個人あてのメッセージは送りません。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">保持期間と削除</h2>
          <p>
            卒団すると、その部員の情報はアーカイブになり、通常の画面には表示されなくなります。データそのものの削除をご希望の場合はコーチにお伝えください。順次削除します。アプリの中から削除を申し込める手続きは、今後追加する予定です。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">顔写真</h2>
          <p>
            現在は扱っていません。お子さんの表示は名前の頭文字で代えています。導入するときは、事前に説明したうえで、あらためて同意をいただきます。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">改定</h2>
          <p>
            内容を変えたときは、このページの最終更新日を新しくしてお知らせします。
          </p>
        </section>

        <section className="card legal">
          <h2 className="ttl">問い合わせ</h2>
          <p>チームのコーチまで、LINE でお声がけください。</p>
        </section>

        <div className="legal-link">
          <Link href="/">ホームへ</Link>
        </div>
      </main>
    </>
  );
}
