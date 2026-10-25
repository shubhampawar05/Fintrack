import { describe, expect, it } from "vitest";
import { categorize, type RuleLike } from "@/lib/categorize/engine";
import { extractCounterparty, isOwnCounterparty, isTruncatedOwnName, sharesSurname } from "@/lib/categorize/counterparty";
import { testContext } from "./helpers";

const cat = (description: string, direction: "DEBIT" | "CREDIT" = "DEBIT", ctx = testContext()) =>
  categorize({ description, direction, amountPaise: 100_00, accountId: "a1" }, ctx);

describe("counterparty extraction", () => {
  it("parses Federal UPI narrations with VPA, RRN and MCC", () => {
    const cp = extractCounterparty("UPIOUT/694350494740/blinkit.payu@hdfcbank/UP/5411");
    expect(cp).toMatchObject({ channel: "UPI", bankRef: "694350494740", vpa: "blinkit.payu@hdfcbank", mcc: "5411", display: "Blinkit", isPerson: false });
  });
  it("parses Kotak UPI narrations with name and bank", () => {
    const cp = extractCounterparty("UPI/DURGESH TALMAL/UBIN/311655796241/Sent using P");
    expect(cp).toMatchObject({ name: "DURGESH TALMAL", bankRef: "311655796241", isPerson: true, display: "Durgesh Talmal" });
  });
  it("parses Kotak UPI narrations without a bank segment and net-banking credits", () => {
    expect(extractCounterparty("UPI/RAVI KUMAR/600000000099/Monthly savings")).toMatchObject({
      channel: "UPI", name: "RAVI KUMAR", bankRef: "600000000099", note: "Monthly savings",
    });
    expect(extractCounterparty("MB: RECEIVED FROM ACME WIDGETS PVT LTD")).toMatchObject({ name: "ACME WIDGETS", isPerson: false, display: "Acme Widgets" });
    expect(extractCounterparty("MB:RECEIVED FROM ACME WIDGETS/BONUS")).toMatchObject({ name: "ACME WIDGETS", note: "BONUS" });
  });
  it("parses Bank of Maharashtra UPI, NEFT, IMPS and reversal narrations", () => {
    expect(extractCounterparty("UPI 619953654294/HDFC/MUTUAL FUNDS ICCL/Paid Via E")).toMatchObject({ bankRef: "619953654294", isPerson: false });
    expect(extractCounterparty("NEFT KKBKN62026072415432699 SPANDANA SPHOORTY FINA KKBK0000958")).toMatchObject({ channel: "NEFT", display: "Spandana Sphoorty" });
    expect(extractCounterparty("IMPS/48/620409418689/**8868/VIKAS RANJAN/KKBKTrans")).toMatchObject({ channel: "IMPS", bankRef: "620409418689", name: "VIKAS RANJAN" });
    expect(extractCounterparty("UPIR 214349821947UPIDEBITREV")).toMatchObject({ isReversal: true, bankRef: "214349821947" });
    expect(extractCounterparty("UPI REFUND RRC 530132895032")).toMatchObject({ isReversal: true, bankRef: "530132895032" });
  });
  it("groups a person's UPI IDs across apps by phone number", () => {
    const a = extractCounterparty("UPIOUT/531051273843/9971174406@pthdfc/NA/0000");
    const b = extractCounterparty("UPI IN/693548137315/9971174406@ptyes/Sent fr/0000");
    const c = extractCounterparty("UPIOUT/1234567890123/9971174406-2@axl/x/0000");
    expect(a.display).toBe("UPI 9971174406");
    expect(new Set([a.key, b.key, c.key])).toEqual(new Set(["phone:9971174406"]));
  });
  it("recognises own accounts by name, phone or UPI handle", () => {
    const own = ["SHUBHAM CHOPDE", "7089971250"];
    expect(isOwnCounterparty(extractCounterparty("UPI/SHUBHAM CHOPDE/FDRL/212120918724/NA"), own)).toBe(true);
    expect(isOwnCounterparty(extractCounterparty("UPI IN/212120918724/7089971250@ptyes/NA/0000"), own)).toBe(true);
    expect(isOwnCounterparty(extractCounterparty("UPI/RAJENDRA CHOP/SBIN/316017700001/Sent using P"), own)).toBe(false);
    expect(isTruncatedOwnName(extractCounterparty("UPI/Mr SHUBHAM CHO/205920477035/Mummy"), own)).toBe(true);
    expect(isTruncatedOwnName(extractCounterparty("UPI/SHUBHAM KUMAR/SBIN/1234567890/x"), own)).toBe(false);
    expect(isTruncatedOwnName(extractCounterparty("UPI/RAJENDRA CHOP/SBIN/316017700001/x"), own)).toBe(false);
  });
  it("hints family support on shared (truncated) surname", () => {
    expect(sharesSurname(extractCounterparty("UPI/RAJENDRA CHOP/SBIN/316017700001/Sent using P"), ["Shubham Chopde"])).toBe(true);
    expect(sharesSurname(extractCounterparty("UPI/SHUBHAM CHOPDE/FDRL/1/x"), ["Shubham Chopde"])).toBe(false);
  });
});

describe("categorization engine", () => {
  it("categorizes recognisable salary credits", () => {
    const r = cat("NEFT-ACMEN12026010100001-ACME TECHNOLOGIES PVT LTD SALARY JAN", "CREDIT");
    expect(r.categoryId).toBe("salary");
    expect(r.needsReview).toBe(false);
  });
  it("categorizes grocery merchants by keyword and by MCC", () => {
    expect(cat("UPI/BLINKIT/YESB/600000000003/Order").categoryId).toBe("groceries");
    const mcc = cat("UPIOUT/531235092699/paytmqr1oygxn6nae@paytm//5411");
    expect(mcc).toMatchObject({ categoryId: "groceries", method: "MCC" });
  });
  it("treats own-account counterparties as internal transfers", () => {
    expect(cat("UPI IN/600000000001/9800000000@ptyes/Move to/0000", "CREDIT")).toMatchObject({ categoryId: "transfer", method: "OWN_ACCOUNT" });
  });
  it("separates credit card bills, investments, cash and bank charges", () => {
    expect(cat("UPIOUT/567614304722/cred.club@axisb/payment /5413").categoryId).toBe("cc-payment");
    expect(cat("MB FT/253322273748/CREDIT/6585/").categoryId).toBe("cc-payment");
    expect(cat("UPI 619953654294/HDFC/MUTUAL FUNDS ICCL/Paid Via E").categoryId).toBe("invest-in");
    expect(cat("ACH GROWW INVEST TE UX3H2MWDLVG2LF").categoryId).toBe("invest-in");
    expect(cat("CHRG/NACH RETURN/24-08-2026/3GROWW INVEST TECH PR").categoryId).toBe("bank-charges");
    expect(cat("ATW-512345XXXXXX1234-KOTAK ATM CASH").categoryId).toBe("cash");
    expect(cat("Int.Pd:0248803661:01-07-2026 to 30-09-2026", "CREDIT").categoryId).toBe("interest");
  });
  it("marks ambiguous person-to-person payments for review instead of guessing", () => {
    const r = cat("UPI/RAVI KUMAR/ICIC/600000000012/Sent using P");
    expect(r).toMatchObject({ categoryId: "unclassified", needsReview: true, confidence: 0 });
  });
  it("flags low-confidence guesses for review", () => {
    const r = cat("UPI/SUNITA VERMA/SBIN/600000000006/Sent using P");
    expect(r).toMatchObject({ categoryId: "family", needsReview: true });
  });
  it("lets user rules override built-in rules and own-account detection", () => {
    const userRule: RuleLike = {
      id: "u1", field: "DESCRIPTION", matchType: "CONTAINS", pattern: "blinkit", categoryId: "food",
      priority: 10, isSystem: false, enabled: true, confidence: 1, merchantName: "Blinkit snacks",
    };
    const ctx = testContext();
    ctx.rules.push(userRule);
    const r = cat("UPI/BLINKIT/YESB/600000000003/Order", "DEBIT", ctx);
    expect(r).toMatchObject({ categoryId: "food", method: "USER_RULE", ruleId: "u1", merchant: "Blinkit snacks", needsReview: false });
    // A disabled rule has no effect.
    userRule.enabled = false;
    expect(cat("UPI/BLINKIT/YESB/600000000003/Order", "DEBIT", ctx).categoryId).toBe("groceries");
  });
  it("respects rule direction and amount bounds", () => {
    const ctx = testContext();
    ctx.rules.push({ id: "u2", field: "MERCHANT", matchType: "EQUALS", pattern: "ravi kumar", categoryId: "lending", direction: "DEBIT", minAmountPaise: 1000_00, priority: 5, isSystem: false, enabled: true, confidence: 1 });
    const small = categorize({ description: "UPI/RAVI KUMAR/ICIC/600000000012/x", direction: "DEBIT", amountPaise: 500_00, accountId: "a" }, ctx);
    const large = categorize({ description: "UPI/RAVI KUMAR/ICIC/600000000012/x", direction: "DEBIT", amountPaise: 3000_00, accountId: "a" }, ctx);
    expect(small.categoryId).toBe("unclassified");
    expect(large.categoryId).toBe("lending");
  });
  it("accepts everyday notes on person payments but flags risky ones", () => {
    expect(cat("UPIOUT/641425089220/9761658231@ybl/rapido/0000")).toMatchObject({ categoryId: "transport", needsReview: false });
    expect(cat("UPIOUT/602204399026/9971174406@ptsbi/Rent/0000")).toMatchObject({ categoryId: "rent", needsReview: true });
    expect(cat("UPIOUT/600000000030/friend123@okaxis/Loan/0000")).toMatchObject({ categoryId: "loans", needsReview: true });
  });
  it("ignores invalid user regexes safely", () => {
    const ctx = testContext();
    ctx.rules.push({ id: "bad", field: "DESCRIPTION", matchType: "REGEX", pattern: "([", categoryId: "food", priority: 1, isSystem: false, enabled: true, confidence: 1 });
    expect(cat("UPI/BLINKIT/YESB/1/Order", "DEBIT", ctx).categoryId).toBe("groceries");
  });
});
