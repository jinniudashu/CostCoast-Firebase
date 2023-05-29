// Download the helper library from https://www.twilio.com/docs/node/install
// Set environment variables for your credentials
// Read more at http://twil.io/secure
import twilio from "twilio";
export const sendSMS = async (body: string, to: string) => {
  const accountSid = "";
  const authToken = "";
  const client = twilio(accountSid, authToken);
  await client.messages
    .create({body: body, from: "", to: to})
    .then((message) =>
      console.log(message.sid, "sent to:", to, "body:", body)
    );
};
