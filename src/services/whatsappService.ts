import crypto from "crypto";
import axios from "axios";

export const verifyWhatsappSignature = (rawBody: Buffer, signatureHeader?: string) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const processWhatsAppData = async (data: any) => {
  const forwardUrl = process.env.WHATSAPP_FORWARD_URL;
  if (forwardUrl) {
    await axios.post(forwardUrl, data);
  }
  return data;
};
