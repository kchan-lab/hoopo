// UUID 形式の検証(ルートパラメータ・入力の事前チェック用)。
// packages/db の isValidTeamId と同じ規則。API 内ではこれ1箇所に集約する

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
