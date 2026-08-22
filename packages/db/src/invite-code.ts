import { randomInt } from "node:crypto";

// 招待コードの文字種: Crockford Base32(数字 + 英大文字から I/L/O/U を除いた32文字)。
// 紙・口頭・手入力での伝達を想定し、見間違えやすい文字を含めない(plan.md 設計判断4)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const INVITE_CODE_LENGTH = 10;

// 32^10 ≒ 1.1e15 通り。総当たりに対する推測困難性は桁数で担保する(§9)。
// 一意性は children.invite_code の UNIQUE 制約が最終防衛線(衝突時は再生成してリトライ)
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
