import { Request, Response } from "express";
import { processWhatsAppData, verifyWhatsappSignature } from "../services/whatsappService";

const WHATSAPP_WELCOME_TEMPLATE_NAME = process.env.WHATSAPP_WELCOME_TEMPLATE_NAME || "first_welcome_messsage";
const WHATSAPP_INTERACTIVE_TEMPLATE_NAME = process.env.WHATSAPP_INTERACTIVE_TEMPLATE_NAME || "interactive_template_sandbox";

export const verifyWhatsappWebhook = (req: Request, res: Response): void => {
//  just say hello to the webhook verification
console.log("Verifying WhatsApp Webhook");
res.status(200).send("Hello, WhatsApp Webhook Verified!")
};

export const receiveWhatsappWebhook = async (req: Request, res: Response): Promise<void> => {
  console.log(`Incoming WhatsApp Message at ${new Date().toISOString()}`);
  console.log(JSON.stringify(req.body, null, 2));

  // if user sends hello, send welcome template message
  if (
    req.body.entry &&
    req.body.entry[0].changes &&
    req.body.entry[0].changes[0].value &&
    req.body.entry[0].changes[0].value.messages &&
    req.body.entry[0].changes[0].value.messages.length > 0
  ) {
    const change = req.body.entry[0].changes[0].value;
    const message = change.messages[0];
    const from = message.from; // sender's phone number / wa_id
    const text = message.text && message.text.body ? message.text.body.trim().toLowerCase() : '';

    // try to get the sender's profile name from contacts if available
    let profileName = undefined;
    if (change.contacts && Array.isArray(change.contacts) && change.contacts.length > 0) {
      profileName = change.contacts[0].profile && change.contacts[0].profile.name
        ? change.contacts[0].profile.name
        : undefined;
    }

    // greetings to trigger the welcome template
    const greetings = ["hello", "hi", "hey", "hola"];
    if (text && greetings.includes(text)) {
      const nameToUse = profileName || 'there';
      await interactiveTemplateMessage(from);
    }
  }

  res.sendStatus(200);
};

export const sendWhatsappMessage = async (req: Request, res: Response): Promise<void> => {
  const { to, message } = req.body;
  if (!to || !message) {
    res.status(400).json({ error: "Missing 'to' or 'message' in request body" });
    return;
  }
  try {
    const url = `${process.env.WHATSAPP_API_URL}/messages`;
    const token = process.env.WHATSAPP_API_TOKEN || '';
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.WHATSAPP_API_AUTH === 'bearer') {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["D360-API-KEY"] = token;
    }

    const payload = {
      to: to,
      messaging_product: "whatsapp",
      type: "text",
      text: { body: message }
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) {
      const respText = await response.text();
      console.error('WhatsApp send failed', response.status, respText);
      res.status(502).json({ error: 'Failed to send WhatsApp message', details: respText });
      return;
    }

    console.log("WhatsApp message sent successfully");
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
};

const welcomeTemplateMessage = async (to: string, placeholder: string): Promise<void> => {
  console.log(`Sending welcome template message to ${to} with placeholder '${placeholder}'`);
  try {
    const url = `${process.env.WHATSAPP_API_URL}/messages`;
    const token = process.env.WHATSAPP_API_TOKEN || '';
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.WHATSAPP_API_AUTH === 'bearer') {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["D360-API-KEY"] = token;
    }

    const payload = {
      to: to,
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: WHATSAPP_WELCOME_TEMPLATE_NAME,
        language: { code: "en" },
        components: [ { type: "body", parameters: [ { type: "text", text: placeholder } ] } ]
      }
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) {
      const respText = await response.text();
      console.error('Welcome template send failed', response.status, respText);
      throw new Error(`Failed to send welcome template message: ${response.status} ${response.statusText} - ${respText}`);
    }

    console.log("Welcome template message sent successfully");
  } catch (error) {
    console.error("Error sending welcome template message:", error);
    throw error;
  }
};

// {
//   "to": "<YOUR_PHONE_NUMBER>",
//   "messaging_product": "whatsapp",
//   "type": "template",
//   "template": {
//     "name": "interactive_template_sandbox",
//     "language": {
//       "code": "en"
//     },
//     "components": [
//       {
//         "type": "button",
//         "sub_type": "quick_reply",
//         "index": 0,
//         "parameters": [
//           {
//             "type": "payload",
//             "payload": "aGlzIHRoaXMgaXMgY29vZHNhc2phZHdpcXdlMGZoIGFTIEZISUQgV1FEV0RT"
//           }
//         ]
//       },
//       {
//         "type": "button",
//         "sub_type": "quick_reply",
//         "index": 1,
//         "parameters": [
//           {
//             "type": "payload",
//             "payload": "aGlzIHRoaXMgaXMgY29vZHNhc2phZHdpcXdlMGZoIGFTIEZISUQgV1FEV0RT"
//           }
//         ]
//       }
//     ]
//   }
// }

const interactiveTemplateMessage = async (to: string): Promise<void> => {
  console.log(`Sending interactive template message to ${to}`);
  try {
    const url = `${process.env.WHATSAPP_API_URL}/messages`;
    const token = process.env.WHATSAPP_API_TOKEN || '';
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.WHATSAPP_API_AUTH === 'bearer') {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["D360-API-KEY"] = token;
    }

    const payload = {
      to: to,
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: WHATSAPP_INTERACTIVE_TEMPLATE_NAME,
        language: { code: "en" },
        components: [ { type: "button", sub_type: "quick_reply", index: 0, parameters: [ { type: "payload", payload: "aGlzIHRoaXMgaXMgY29vZHNhc2phZHdpcXdlMGZoIGFTIEZISUQgV1FEV0RT" } ] }, { type: "button", sub_type: "quick_reply", index: 1, parameters: [ { type: "payload", payload: "aGlzIHRoaXMgaXMgY29vZHNhc2phZHdpcXdlMGZoIGFTIEZISUQgV1FEV0RT" } ] } ]
      }
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) {
      const respText = await response.text();
      console.error('Interactive template send failed', response.status, respText);
      throw new Error(`Failed to send interactive template message: ${response.status} ${response.statusText} - ${respText}`);
    }
    console.log("Interactive template message sent successfully");
  } catch (error) {
    console.error("Error sending interactive template message:", error);
    throw error;
  }
};
