export function summarizeTwilio(data: any): string {
  if (!data || data.error) return "";

  const parts = [
    `Twilio: account ${data.accountStatus}, ${data.phoneNumberCount} phone number(s)`,
  ];
  if (data.type) parts.push(`type: ${data.type}`);

  return parts.join(", ");
}
