// LINE userId の暗号化と検索用ハッシュ(CLAUDE.md 絶対原則4、guardians スキーマのコメント参照)。
// - 保存するのは AES-256-GCM の暗号文のみ。復号は LINE 送信等で userId が必要な場面に限る
// - 検索(ログイン時の guardian 特定)は決定的な HMAC-SHA256 hex を別列に持つ
// - 鍵は 64 桁 hex(32 バイト)。暗号化鍵と HMAC 鍵は必ず別の値にする
// - Web 標準 API(Web Crypto)のみ使用 — 将来 Workers 等へ切り出すため Node 固有 API は使わない

const ENC_PREFIX = "enc:v1";
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;

function hexToBytes(hex: string, label: string): Uint8Array<ArrayBuffer> {
  if (!KEY_HEX_PATTERN.test(hex)) {
    // 鍵の設定ミス(短い・hex でない)は起動時に確実に気づけるよう fail-fast
    throw new Error(`${label} は 64 桁の hex(32 バイト)で指定してください`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function encryptLineUserId(
  lineUserId: string,
  encryptionKeyHex: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(encryptionKeyHex, "LINE_ID_ENCRYPTION_KEY"),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(lineUserId),
  );
  return `${ENC_PREFIX}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptLineUserId(
  encrypted: string,
  encryptionKeyHex: string,
): Promise<string> {
  const parts = encrypted.split(":");
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== ENC_PREFIX) {
    throw new Error("暗号文の形式が不正です(enc:v1:<iv>:<ct> を期待)");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(encryptionKeyHex, "LINE_ID_ENCRYPTION_KEY"),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(parts[2] as string) },
    key,
    fromBase64Url(parts[3] as string),
  );
  return new TextDecoder().decode(plaintext);
}

// ログイン時に guardian を引くための決定的ハッシュ(guardians.line_user_id_lookup)
export async function lineUserIdLookup(
  lineUserId: string,
  hmacKeyHex: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(hmacKeyHex, "LINE_ID_HMAC_KEY"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(lineUserId),
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
