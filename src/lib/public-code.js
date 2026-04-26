import { customAlphabet } from "nanoid";

const PUBLIC_CODE_LENGTH = 8;
const createCode = customAlphabet("23456789abcdefghijkmnopqrstuvwxyz", PUBLIC_CODE_LENGTH);

export function generatePublicCode() {
  return createCode();
}

export async function generateUniquePublicCode(tx, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const publicCode = generatePublicCode();
    const existing = await tx.event.findUnique({ where: { publicCode }, select: { id: true } });

    if (!existing) return publicCode;
  }

  throw new Error("Kunne ikke oprette en unik event-kode. Prøv igen.");
}
