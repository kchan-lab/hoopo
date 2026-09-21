import { expect, type Locator, type Page } from "@playwright/test";

// 保護者アプリのフォーム部品が iOS Safari の自動ズームを起こさないことの検証(Issue #205)。
// 実効フォントサイズが 16px 未満の input / select / textarea にフォーカスすると
// iOS Safari は自動で拡大し、blur しても倍率を戻さない。
// CSS 側の回帰は apps/portal/app/globals.test.ts が見張るが、実効値
// (継承・上書きの結果)はブラウザに描かせないと分からないのでここで測る
// (docs/DESIGN_GUIDELINES.md §3)。

const MIN_FONT_SIZE_PX = 16;

// 文字入力のためにフォーカスする部品だけを見る。チェックボックス・ラジオ・
// ボタン類は iOS の自動ズームの対象外
const TEXT_ENTRY =
  "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea";

/**
 * 画面(または一部)に出ているフォーム部品が、すべて 16px 以上で描かれていることを確かめる。
 * @param scope ページ全体、またはカードなどの一部
 */
export async function expectNoAutoZoom(scope: Page | Locator): Promise<void> {
  const controls = scope.locator(TEXT_ENTRY);
  const count = await controls.count();
  // 対象が1つも無いまま素通りするのを防ぐ
  expect(count, "フォーム部品が1つも見つからない").toBeGreaterThan(0);

  const tooSmall: string[] = [];
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const size = await control.evaluate((el) => {
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("name") ??
        el.getAttribute("placeholder") ??
        `${el.tagName.toLowerCase()}.${el.className}`;
      return { px, label };
    });
    if (size.px < MIN_FONT_SIZE_PX) {
      tooSmall.push(`${size.label}: ${size.px}px`);
    }
  }
  expect(tooSmall, "16px 未満のフォーム部品がある").toEqual([]);
}
