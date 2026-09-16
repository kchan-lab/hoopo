/// <reference lib="dom" />
import type { Page } from "@playwright/test";

/**
 * 画面を開き、「操作できる状態」になるまで待ってから返す。
 *
 * サーバーから返った HTML は見た目が完成していても、React が受け持つ前に入力すると
 * その値は直後の初期化で空に戻される。最初の入力(例: 登録画面の「姓」)だけが消え、
 * 必須チェックに引っかかってボタンが反応しない、という形で E2E がまれに落ちていた。
 *
 * React は受け持った DOM 要素に `__reactProps$...` を付けるので、目印の要素に
 * それが付くのを待てば「もう入力してよい」と判断できる。
 */
export async function gotoReady(
  page: Page,
  url: string,
  selector = "form",
): Promise<void> {
  await page.goto(url);
  await waitForHydration(page, selector);
}

/** すでに開いている画面が操作できる状態になるまで待つ */
export async function waitForHydration(
  page: Page,
  selector = "form",
): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return (
        el !== null &&
        Object.keys(el).some((key) => key.startsWith("__reactProps$"))
      );
    },
    selector,
    { timeout: 15000 },
  );
}
