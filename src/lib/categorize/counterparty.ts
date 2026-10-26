/**
 * Extract structured counterparty information from Indian bank narrations.
 * The original description is never modified; this only derives fields from it.
 */

export type Channel = "UPI" | "NEFT" | "IMPS" | "RTGS" | "ATM" | "CARD" | "ACH" | "CHARGE" | "INTEREST" | "INTERNAL" | "OTHER";

export interface Counterparty {
  channel: Channel;
  /** Person or merchant name as printed, if any. */
  name?: string;
  /** UPI VPA, if any. */
  vpa?: string;
  /** Merchant category code (Federal Bank prints it for UPI payments). "0000" = person-to-person. */
  mcc?: string;
  /** UPI RRN / IMPS reference — identical on both sides of a transfer. */
  bankRef?: string;
  note?: string;
  /** True when the counterparty looks like an individual rather than a business. */
  isPerson: boolean;
  /** Normalized key for grouping (merchant rankings, recurring detection). */
  key: string;
  /** Human-friendly display name. */
  display: string;
  /** True when this narration is a bank-side reversal/refund of an earlier debit. */
  isReversal: boolean;
}

const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/blinkit/i, "Blinkit"],
  [/zepto/i, "Zepto"],
  [/swiggy/i, "Swiggy"],
  [/zomato/i, "Zomato"],
  [/bigbasket|bbnow/i, "BigBasket"],
  [/amazon ?pay ?cc|amazonpayccbill/i, "Amazon Pay card bill"],
  [/amazon|amzn/i, "Amazon"],
  [/flipkart/i, "Flipkart"],
  [/myntra/i, "Myntra"],
  [/irctc/i, "IRCTC"],
  [/uber/i, "Uber"],
  [/olacabs|\bola\b/i, "Ola"],
  [/rapido/i, "Rapido"],
  [/cred\.club|credclub/i, "CRED"],
  [/fcpgaxisbankbsfi/i, "Axis Bank card (via Freecharge)"],
  [/sbicard|sbi cards/i, "SBI Card"],
  [/chqcc|\bcheq\b/i, "CheQ (card bill)"],
  [/jupiter/i, "Jupiter"],
  [/supercard/i, "Supercard"],
  [/ccbillpay/i, "Card bill pay"],
  [/groww/i, "Groww"],
  [/zerodha/i, "Zerodha"],
  [/mutual funds? (iccl|ncl)/i, "Mutual fund (exchange)"],
  [/kukufm/i, "Kuku FM"],
  [/netflix/i, "Netflix"],
  [/spotify/i, "Spotify"],
  [/airtel/i, "Airtel"],
  [/\bjio/i, "Jio"],
  [/paytm/i, "Paytm"],
  [/phonepe/i, "PhonePe"],
  [/navi finserv/i, "Navi Finserv"],
  [/kanakadurga/i, "Kanakadurga Finance"],
  [/spandana/i, "Spandana Sphoorty"],
  [/piepay/i, "PiePay"],
];

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** Group a person's UPI IDs across apps (98xxxxxxxx@ptyes, @ybl, -2@axl) by phone number. */
function vpaKey(vpa: string): string {
  const local = vpa.toLowerCase().split("@")[0].replace(/-\d+$/, "");
  const phone = /^(?:91)?(\d{10})$/.exec(local);
  return phone ? `phone:${phone[1]}` : vpa.toLowerCase().replace(/-\d+@/, "@");
}

/** Apps that carry UPI payments for others; their name in a UPI ID says nothing about the payee. */
export const PAYMENT_APPS = new Set(["Paytm", "PhonePe"]);

export function knownMerchant(text: string): string | undefined {
  return KNOWN_MERCHANTS.find(([re]) => re.test(text))?.[1];
}

function vpaDisplay(vpa: string): { display: string; isPerson: boolean } {
  const local = vpa.split("@")[0];
  const known = knownMerchant(vpa);
  if (known) return { display: known, isPerson: false };
  if (/^paytmqr|^q\d{6,}|bharatpe|^vyapar\.|^gpay-|^bharatqr|\.rzp$|razorpay|^pay\w*@|^mab\.|^msw|merchant/i.test(vpa)) {
    return { display: `QR merchant (${vpa})`, isPerson: false };
  }
  if (/^\+?\d{10,12}(-\d+)?$/.test(local)) return { display: `UPI ${local.replace(/-\d+$/, "").slice(-10)}`, isPerson: true };
  // Personal VPAs are usually name-like; business VPAs carry dots, digits or brand words.
  const person = /^[a-z][a-z0-9._-]*$/i.test(local) && !/\.(payu|pg|billpay|collect)|store|shop|mart|pay\b/i.test(local);
  return { display: local.replace(/[._-]+/g, " ").replace(/\d+$/, "").trim() || vpa, isPerson: person };
}

export function extractCounterparty(description: string): Counterparty {
  const d = description.replace(/\s+/g, " ").trim();
  const base = { isPerson: false, isReversal: false };
  let m: RegExpExecArray | null;

  // Federal: UPIOUT/<rrn>/<vpa>/<note>/<mcc>  |  UPI IN/<rrn>/<vpa>/<note>/<mcc>
  if ((m = /^UPI ?(?:OUT|IN)\/(\d{9,14})\/?(.*)$/i.exec(d))) {
    const parts = m[2].split("/").map((p) => p.trim());
    const mcc = parts.length > 1 && /^\d{4}$/.test(parts[parts.length - 1]) ? parts.pop() : undefined;
    const vpaIdx = parts.findIndex((p) => p.includes("@"));
    const vpa = vpaIdx >= 0 ? parts[vpaIdx].replace(/\s+/g, "") : undefined;
    const note = parts.slice(vpaIdx + 1).join("/").trim() || undefined;
    const v = vpa ? vpaDisplay(vpa) : { display: "UPI payment", isPerson: false };
    return {
      ...base,
      channel: "UPI",
      vpa,
      mcc,
      bankRef: m[1],
      note: note && !/^NA$/i.test(note) ? note : undefined,
      isPerson: mcc === "0000" || (!mcc && v.isPerson),
      key: vpaKey(vpa ?? m[2]),
      display: v.display,
    };
  }
  // Federal: UPI REFUND RRC <rrn>
  if ((m = /^UPI REFUND (?:RRC )?(\d{9,14})/i.exec(d))) {
    return { ...base, channel: "UPI", bankRef: m[1], key: "upi-refund", display: "UPI refund", isReversal: true };
  }
  // BoM: UPIR <rrn>UPIDEBITREV
  if ((m = /^UPIR ?(\d{9,14})/i.exec(d))) {
    return { ...base, channel: "UPI", bankRef: m[1], key: "upi-reversal", display: "UPI reversal", isReversal: true };
  }
  // Kotak: UPI/<NAME>/<BANK>/<rrn>/<note> (the bank segment is missing on some payments)
  if ((m = /^UPI\/([^/]+)\/(?:([A-Z]{4})\/)?(\d{9,14})\/?(.*)$/i.exec(d))) {
    const name = m[1].replace(/^(Mr|Mrs|Ms|Dr)\.? /i, "").trim();
    const known = knownMerchant(name);
    return {
      ...base,
      channel: "UPI",
      name,
      bankRef: m[3],
      note: m[4] && !/^(NA|Sent using P.*)$/i.test(m[4]) ? m[4] : undefined,
      isPerson: !known && !/\b(SWEETS|STORE|MART|SHOP|TRADERS|ENTERPRISES?|PVT|LTD|LIMITED|MEDICOS?|PHARMA|HOTEL|RESTAURANT|CAFE|SERVICES?)\b/i.test(name),
      key: `name:${name.toLowerCase()}`,
      display: known ?? titleCase(name),
    };
  }
  // BoM: UPI <rrn>/<BANK>/<NAME>/<note>
  if ((m = /^UPI (\d{9,14})\/([A-Z]{4})\/([^/]+)\/?(.*)$/i.exec(d))) {
    const name = m[3].trim();
    const known = knownMerchant(name);
    return {
      ...base,
      channel: "UPI",
      name,
      bankRef: m[1],
      note: m[4] && !/^(NA|Sent using P.*|Paid Via E.*|Pay via R.*)$/i.test(m[4]) ? m[4] : undefined,
      isPerson: !known && !/\b(FUNDS?|ICCL|NCL|LTD|LIMITED|PVT|MEDICOS?|STORE|MART|BANK)\b/i.test(name),
      key: `name:${name.toLowerCase()}`,
      display: known ?? titleCase(name),
    };
  }
  // Kotak incoming net-banking transfer: "MB: RECEIVED FROM <NAME>[/<note>]"
  if ((m = /^MB: ?RECEIVED FROM ([^/]+?)(?:\/(.*))?$/i.exec(d))) {
    const company = /^(.*?)\s+(?:PVT\.? LTD|PRIVATE LIMITED|LIMITED|LTD|LLP)\b/i.exec(m[1]);
    const name = (company?.[1] ?? m[1]).trim();
    return {
      ...base,
      channel: "OTHER",
      name,
      note: m[2]?.trim() || undefined,
      isPerson: !company,
      key: `name:${name.toLowerCase()}`,
      display: knownMerchant(name) ?? titleCase(name),
    };
  }
  // IMPS: BoM "IMPS/48/<rrn>/**8868/NAME/..." ; Federal "FT IMPS/IFI/<rrn>/NAME"
  if ((m = /IMPS\/(?:\d+|IFI)\/(\d{9,14})\/(?:\*+\d+\/)?([^/]+)/i.exec(d))) {
    const name = m[2].trim();
    return {
      ...base,
      channel: "IMPS",
      name,
      bankRef: m[1],
      key: `name:${name.toLowerCase()}`,
      display: knownMerchant(name) ?? titleCase(name),
    };
  }
  // NEFT: "NEFT <UTR> <NAME> <IFSC>" or "NFT/<NAME>/<UTR>/..."
  if ((m = /^NEFT ([A-Z0-9]{12,22}) (.+?)(?: [A-Z]{4}0[A-Z0-9]{6})?$/i.exec(d))) {
    const name = m[2].trim();
    return { ...base, channel: "NEFT", name, bankRef: m[1], key: `name:${name.toLowerCase()}`, display: knownMerchant(name) ?? titleCase(name) };
  }
  // Hyphenated NEFT (Kotak and others): "NEFT-<UTR>-<NAME> <free text>"
  if ((m = /^NEFT[-/]([A-Z0-9]{10,22})[-/](.+)$/i.exec(d))) {
    const company = /^(.*?\b(?:PVT\.? LTD|PRIVATE LIMITED|LIMITED|LTD|LLP))\b/i.exec(m[2]);
    const name = (company?.[1] ?? m[2]).trim();
    return { ...base, channel: "NEFT", name, bankRef: m[1], key: `name:${name.toLowerCase()}`, display: knownMerchant(name) ?? titleCase(name) };
  }
  if ((m = /^NFT\/([^/]+)\/([A-Z0-9]+)/i.exec(d))) {
    const name = m[1].trim();
    return { ...base, channel: "NEFT", name, bankRef: m[2], key: `name:${name.toLowerCase()}`, display: knownMerchant(name) ?? titleCase(name) };
  }
  if ((m = /^RTGS[/ -]([A-Z0-9]+)[/ ](.+)$/i.exec(d))) {
    return { ...base, channel: "RTGS", name: m[2], bankRef: m[1], key: `name:${m[2].toLowerCase()}`, display: titleCase(m[2]) };
  }
  // ACH / NACH debits: "ACH GROWW INVEST TE <umrn>"
  if ((m = /^(?:N?ACH)[ /-]+(?:DR[ /-]+)?([A-Z][A-Z &.]+?)(?: [A-Z0-9]{8,})?$/i.exec(d))) {
    const name = m[1].trim();
    return { ...base, channel: "ACH", name, key: `name:${name.toLowerCase()}`, display: knownMerchant(name) ?? titleCase(name) };
  }
  if (/^(CHRG|SMS|MONTHLY SMS|GST$|.*\bAMC\b|.*CHARGES?\b)/i.test(d)) {
    return { ...base, channel: "CHARGE", key: "bank-charges", display: "Bank charges" };
  }
  if (/Int\.?Pd|^SBINT|BY INTT|INTEREST/i.test(d)) {
    return { ...base, channel: "INTEREST", key: "bank-interest", display: "Bank interest" };
  }
  if (/^MB FT\/\d+\/CREDIT\/(\d{4})/i.test(d)) {
    const last4 = /CREDIT\/(\d{4})/i.exec(d)![1];
    return { ...base, channel: "INTERNAL", key: `card:${last4}`, display: `Credit card ••${last4}` };
  }
  if (/^\d{6}X+\d{4}\b|\bATW\b|\bATL\b|ATM|NWD|CASH WDL/i.test(d)) {
    return { ...base, channel: "ATM", key: "atm", display: "ATM / card" };
  }
  if (/^Ac xfr/i.test(d)) {
    return { ...base, channel: "INTERNAL", key: "account-internal", display: "Internal account adjustment" };
  }
  const known = knownMerchant(d);
  const key = d
    .toLowerCase()
    .replace(/\d{4,}/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return { ...base, channel: "OTHER", key: key || "unknown", display: known ?? titleCase(key || d.slice(0, 40)) };
}

/** Does any of the user's own identifiers (names, phone, UPI IDs) appear as the counterparty? */
export function isOwnCounterparty(cp: Counterparty, ownIdentifiers: string[]): boolean {
  const fields = [cp.name, cp.vpa].filter(Boolean).map((s) => s!.toUpperCase().replace(/\s+/g, " "));
  if (!fields.length) return false;
  return ownIdentifiers.some((raw) => {
    const id = raw.toUpperCase().trim();
    if (id.length < 4) return false;
    // Phone numbers and UPI IDs: substring of the VPA. Names: whole-name match.
    if (/^\d+$/.test(id) || id.includes("@")) return fields.some((f) => f.includes(id));
    return fields.some((f) => f === id || f.startsWith(`${id} `) || f.endsWith(` ${id}`));
  });
}

/**
 * The bank cut the name short ("SHUBHAM CHO" for "SHUBHAM CHOPDE"): same first name and the
 * printed surname is a prefix of an own name's surname. Weaker than an exact match.
 */
export function isTruncatedOwnName(cp: Counterparty, ownIdentifiers: string[]): boolean {
  const name = cp.name?.toUpperCase().trim().split(/\s+/);
  if (!name || name.length < 2) return false;
  return ownIdentifiers.some((raw) => {
    if (/^\d+$/.test(raw) || raw.includes("@")) return false;
    const own = raw.toUpperCase().trim().split(/\s+/);
    if (own.length !== name.length || own[0] !== name[0]) return false;
    const last = name[name.length - 1];
    return last.length >= 2 && own[own.length - 1].startsWith(last);
  });
}

/** Same surname as the account holder but a different person — a family-support hint. */
export function sharesSurname(cp: Counterparty, holderNames: string[]): boolean {
  if (!cp.isPerson || !cp.name) return false;
  const name = cp.name.toUpperCase().split(/\s+/);
  return holderNames.some((h) => {
    const parts = h.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return false;
    const surname = parts[parts.length - 1];
    const first = parts[0];
    // Kotak truncates names ("RAJENDRA CHOP"), so allow a 4+ letter prefix of the surname.
    const last = name[name.length - 1];
    return name[0] !== first && last.length >= 4 && surname.startsWith(last);
  });
}
