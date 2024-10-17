const HMAC_ALGORITHM_U = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
const HMAC_ALGORITHM_L = ["sha1", "sha256", "sha384", "sha512"] as const;
const HMAC_ALGORITHMS = [...HMAC_ALGORITHM_U, ...HMAC_ALGORITHM_L] as const;

type HmacAlgorithmUpper = (typeof HMAC_ALGORITHM_U)[number];
type HmacAlgorithmLower = (typeof HMAC_ALGORITHM_L)[number];
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

function isHmacAlgorithmUpper(
  algorithm: string,
): algorithm is HmacAlgorithmUpper {
  // @ts-expect-error: type narrowing
  return HMAC_ALGORITHM_U.includes(algorithm);
}

function isHmacAlgorithmLower(
  algorithm: string,
): algorithm is HmacAlgorithmLower {
  // @ts-expect-error: type narrowing
  return HMAC_ALGORITHM_L.includes(algorithm);
}

function hmacAlgorithm(algorithm: string): HmacAlgorithmUpper {
  if (isHmacAlgorithmUpper(algorithm)) return algorithm;
  if (isHmacAlgorithmLower(algorithm)) {
    switch (algorithm) {
      case "sha1":
        return "SHA-1";
      case "sha256":
        return "SHA-256";
      case "sha384":
        return "SHA-384";
      case "sha512":
        return "SHA-512";
    }
  }

  throw new Error(`invalid hmac algorithm: ${algorithm}`);
}

export function cryptoKey(
  algorithm: string,
  secret: string,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: hmacAlgorithm(algorithm) } satisfies HmacImportParams,
    false,
    ["sign"],
  );
}
