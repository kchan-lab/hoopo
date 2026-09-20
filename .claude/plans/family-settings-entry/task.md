# Task: 家族の設定への導線を分かりやすくする

Issue: [#186](https://github.com/kchan-lab/hoopo/issues/186) / Plan: [plan.md](plan.md)

- [x] portal: ヘッダーの丸ボタンを押せるようにする(aria-label・押せると分かる縁)
- [x] portal: 丸ボタンでメニューを開く(家族の設定 / プライバシーポリシー / ログアウト)
- [x] api: 保護者アプリのログアウト(`POST /auth/logout`。管理画面と同じくセッション Cookie を消すだけ)
- [x] test: Integration(ログアウトで Cookie が消え、以降 401)
- [x] portal: ホームの「家族の設定」のカードを、次の画面へ進む行として見せる(矢印・見出しの文字色)
- [x] portal: globals.css(修飾クラスで足す。他の .card.choice に影響させない)
- [x] docs: REQUIREMENTS §4.2-1 にヘッダーからの導線を追記
- [x] test: E2E(丸ボタン → メニュー → 家族の設定 / ログアウト。既存の導線も壊れていないこと)
- [x] portal: メニューを全画面のヘッダーに出す(privacy と register は除く。お子さんの取得は1か所にまとめる)
- [x] test: E2E(代表的な画面にメニューが出ていること。/privacy と /register には出ないこと)
- [x] portal: 左上のチームのマークを全画面のヘッダーに出す(`.logo` を共通化し、ヘッダー用は `.logo.sm`)
- [x] docs: REQUIREMENTS §4.2 のヘッダーの記述をマークの常設に合わせる
- [x] test: E2E(マークからホームへ戻れること。/privacy と /register には出ないこと。見出しが折り返さないこと)
- [x] 画面のスクリーンショットを承認者に見せる(mobile。マージ承認の前)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #186`)
