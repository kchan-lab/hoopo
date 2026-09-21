import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 保護者アプリのフォーム部品が 16px を下回らないことの回帰テスト(Issue #205)。
// iOS Safari はフォーカスした input / select / textarea の実効フォントサイズが 16px 未満だと
// 自動で拡大し、blur しても倍率を戻さない。§1.2 の本文13px・補助11–12px をそのまま
// フォーム部品に書くと再発するため、CSS を読んで機械的に見張る
// (docs/DESIGN_GUIDELINES.md §3)。

const MIN_FONT_SIZE_PX = 16;

const css = stripComments(
  readFileSync(new URL("./globals.css", import.meta.url), "utf8"),
);
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

/** CSS のコメントを外す(コメント内の記述をルールとして拾わないため) */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

type Rule = { selector: string; body: string };

/** globals.css は入れ子のない素の CSS。`セレクタ { 宣言 }` をそのまま拾う */
function parseRules(source: string): Rule[] {
  const rules: Rule[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector = "", body = ""] = m;
    rules.push({ selector: selector.trim(), body });
  }
  return rules;
}

/**
 * 文字入力でフォーカスされうる部品を指すセレクタか。
 * button は iOS の自動ズームの対象外なので含めない。
 * .inbox は input / textarea 専用の共通クラス(apps/portal/app/globals.css)
 */
function targetsFormControl(selector: string): boolean {
  return selector
    .split(",")
    .some(
      (one) =>
        /(^|[\s>+~])(input|select|textarea)([\s.:[]|$)/.test(one.trim()) ||
        /\.inbox([\s.:[]|$)/.test(one.trim()),
    );
}

/** 宣言ブロックから、最後に効くプロパティの値を取り出す */
function lastValueOf(body: string, property: string): string | null {
  let value: string | null = null;
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    if (decl.slice(0, i).trim() !== property) continue;
    value = decl.slice(i + 1).trim();
  }
  return value;
}

/** 16px 以上と言い切れる値か。inherit のような継承値は「言い切れない」= 不可とする */
function isAtLeastMinimum(value: string): boolean {
  const px = /^([\d.]+)px$/.exec(value);
  if (px) return Number(px[1]) >= MIN_FONT_SIZE_PX;
  const relative = /^([\d.]+)(rem|em)$/.exec(value);
  if (relative) return Number(relative[1]) >= 1;
  return false;
}

const rules = parseRules(css);
const formControlRules = rules.filter((r) => targetsFormControl(r.selector));

describe("portal のフォーム部品のフォントサイズ", () => {
  it("globals.css を規則として読めている", () => {
    // パーサーが壊れて 0 件になり、以降が素通りするのを防ぐ
    expect(rules.length).toBeGreaterThan(100);
    expect(formControlRules.length).toBeGreaterThan(3);
  });

  it("input / select / textarea に 16px 以上の土台がある", () => {
    const base = rules.find(
      (r) =>
        r.selector.replace(/\s+/g, "") === "input,select,textarea" &&
        lastValueOf(r.body, "font-size") !== null,
    );
    expect(
      base,
      "input, select, textarea への font-size の土台が無い",
    ).toBeDefined();
    const value = lastValueOf(base?.body ?? "", "font-size") ?? "";
    expect(isAtLeastMinimum(value), `土台が ${value}`).toBe(true);
  });

  it.each(
    formControlRules
      .filter((r) => lastValueOf(r.body, "font-size") !== null)
      .map(
        (r) => [r.selector, lastValueOf(r.body, "font-size") ?? ""] as const,
      ),
  )("%s の font-size %s が 16px 以上", (_selector, value) => {
    expect(isAtLeastMinimum(value)).toBe(true);
  });

  it("font: inherit を使う規則は font-size を 16px 以上で置き直している", () => {
    // font ショートハンドの inherit は font-size も継承値(body の 13px)に戻す。
    // Issue #205 の .sbr select / .sbr input がまさにこれだった
    const offenders = formControlRules
      .filter((r) => (lastValueOf(r.body, "font") ?? "").length > 0)
      .filter((r) => !isAtLeastMinimum(lastValueOf(r.body, "font-size") ?? ""))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });
});

describe("portal の viewport", () => {
  // 16px 以上で自動ズームを止めるのが方針。ズーム自体は禁止しない
  // (docs/DESIGN_GUIDELINES.md §3、.claude/plans/portal-form-font-size/plan.md 設計判断1・5)
  it("ピンチズームを禁止していない", () => {
    expect(layout).not.toMatch(/maximumScale|maximum-scale/);
    expect(layout).not.toMatch(/userScalable|user-scalable/);
  });
});
