// @ts-check

/**
 * Three sheets to try the lab on, when nobody has a client's file to hand
 * (the owner's screen of 02-11-2026).
 *
 * They exist for two reasons and both are about learning rather than about
 * data: a new joiner should be able to see what the lab does before they
 * are handed a real trial balance, and the checklist's "how to do it"
 * lines only make sense beside a sheet that has the problem in it. So each
 * sample has its faults on purpose — a suspense balance, a duplicated
 * invoice number, a gap in the series, a cheque return.
 *
 * They are **samples and say so on the screen**. Nothing here is a
 * client's data, no part of the app reads them except the lab, and the
 * figures are plainly made up: realistic Indian names and a correctly
 * formed fake GSTIN, with no real PAN anywhere.
 *
 * Plain CSV text rather than objects, because that is what the lab's own
 * reader takes — the sample goes through `profileSheet` exactly like an
 * uploaded file, so what somebody learns on it is true of the real thing.
 */

/** @typedef {{key: string, label: string, what: string, file: string, kind: string}} Sample */

const TRIAL_BALANCE = `Ledger,Group,Closing FY 2025-26,Closing FY 2024-25
Equity share capital,Capital account,-20000000,-20000000
Profit and loss account (opening),Reserves and surplus,-118000000,-96400000
Loan from R. Mehra (director),Unsecured loans,-8500000,-8500000
HDFC Bank OD 5012,Bank OD account,-41055920,-36120000
Sundry creditors - MSME,Sundry creditors,-3960000,-2870000
Sundry creditors - others,Sundry creditors,-23250000,-21400000
Provision for gratuity,Provisions,-2240000,-1930000
Plant and machinery,Fixed assets,96400000,88900000
Rent deposit - Okhla unit,Deposits (asset),1800000,1800000
Closing stock,Stock in hand,58200000,51000000
Sundry debtors - domestic,Sundry debtors,64218300,49800000
Cash in hand,Cash in hand,412620,181400
GST input - CGST and SGST,Duties and taxes,1482610,1104300
Advance to Kumar Packaging,Loans and advances,975000,320000
Suspense account,Suspense account,126450,0
Sales - domestic,Sales accounts,-420000000,-365000000
Interest received,Indirect incomes,-1240000,-1180000
Purchases - raw material,Purchase accounts,251800000,226100000
Freight inward,Direct expenses,11244800,9870000
Salaries and wages,Indirect expenses,38900000,35200000
Interest on OD,Indirect expenses,4120000,3300000
Depreciation,Indirect expenses,9600000,8740000
Audit fees,Indirect expenses,350000,300000
Power and fuel,Indirect expenses,14000000,12600000
Rent rates and other expenses,Indirect expenses,84616140,76400000`;

/**
 * A sales register with four things in it worth finding: one invoice
 * number repeated, one gap in the series, one round half-lakh, and one
 * invoice dated after the period.
 */
const SALES_REGISTER = `Invoice no,Invoice date,Customer,Customer GSTIN,State code,Taxable value,GST rate %,IGST,CGST,SGST
JS/26-27/0101,03-10-2026,Bharat Steel Traders,09AADCB2201K1ZV,09,420000,18,0,37800,37800
JS/26-27/0102,05-10-2026,Delhi Fabricators,07AAFCD4410M1Z3,07,310000,18,55800,0,0
JS/26-27/0103,07-10-2026,Walk-in (B2C),,09,48500,18,0,4365,4365
JS/26-27/0104,09-10-2026,Metro Fabricators,06AABCM7781P1ZK,06,186400,18,33552,0,0
JS/26-27/0105,12-10-2026,Bharat Steel Traders,09AADCB2201K1ZV,09,500000,18,0,45000,45000
JS/26-27/0106,14-10-2026,Om Sai Enterprises,09AAGCO3310L1ZB,09,92750,5,0,2318.75,2318.75
JS/26-27/0107,16-10-2026,Ravi Constructions,09AAHCR7781N1ZD,09,264300,18,0,23787,23787
JS/26-27/0108,17-10-2026,Delhi Fabricators,07AAFCD4410M1Z3,07,118900,18,21402,0,0
JS/26-27/0110,20-10-2026,Agra Tubes,09AAICA5512J1ZQ,09,73600,18,0,6624,6624
JS/26-27/0111,22-10-2026,Bansal Hardware,09AAJCB1120H1ZT,09,151200,18,0,13608,13608
JS/26-27/0112,24-10-2026,City Projects LLP,07AAKFC9031R1Z5,07,338000,18,60840,0,0
JS/26-27/0113,25-10-2026,Kumar and Co,08AALCK4418G1ZN,08,96400,18,17352,0,0
JS/26-27/0114,27-10-2026,Bharat Steel Traders,09AADCB2201K1ZV,09,212800,18,0,19152,19152
JS/26-27/0115,28-10-2026,Metro Fabricators,06AABCM7781P1ZK,06,144500,18,26010,0,0
JS/26-27/0116,29-10-2026,Walk-in (B2C),,09,31200,18,0,2808,2808
JS/26-27/0117,30-10-2026,Om Sai Enterprises,09AAGCO3310L1ZB,09,187300,18,0,16857,16857
JS/26-27/0117,30-10-2026,Om Sai Enterprises,09AAGCO3310L1ZB,09,187300,18,0,16857,16857
JS/26-27/0118,02-11-2026,Ravi Constructions,09AAHCR7781N1ZD,09,129400,18,0,11646,11646`;

/** A bank statement with a cheque return, cash withdrawals and the dues. */
const BANK_STATEMENT = `Date,Narration,Reference,Withdrawal,Deposit,Balance
01-10-2026,Opening balance,,0,0,1250000
03-10-2026,NEFT CR - Bharat Steel Traders,UTIB2610034401,0,495600,1745600
05-10-2026,RTGS DR - Shree Metals,HDFC2610050112,354000,0,1391600
07-10-2026,GST PMT-06 - CPIN 26100700451,CPIN26100700451,186400,0,1205200
07-10-2026,TDS challan 281,BSR0510308,42600,0,1162600
09-10-2026,UPI CR - retail collections,UPI4128830012,0,88450,1251050
10-10-2026,CASH WDL - self,,200000,0,1051050
12-10-2026,NEFT CR - Delhi Fabricators,ICIC2610120077,0,365800,1416850
14-10-2026,SALARY OCT BATCH,SAL26100014,912400,0,504450
15-10-2026,EPFO ECR payment,ECR2610154412,118600,0,385850
16-10-2026,ESIC payment,ESIC261016220,24300,0,361550
18-10-2026,CHQ RETURN - Om Sai Enterprises,CHQ884102,92750,0,268800
20-10-2026,NEFT CR - Metro Fabricators,YESB2610204418,0,219952,488752
21-10-2026,RTGS DR - Punjab Mills,HDFC2610210334,500000,0,-11248
22-10-2026,INT ON OD,INTOD261022,34120,0,-45368
24-10-2026,NEFT CR - City Projects LLP,SBIN2610244190,0,398840,353472
25-10-2026,CASH WDL - self,,150000,0,203472
27-10-2026,NEFT CR - Bansal Hardware,PUNB2610274471,0,178416,381888
29-10-2026,RTGS DR - Noida Cartons,HDFC2610290218,196200,0,185688
30-10-2026,Bank charges,CHG261030,2360,0,183328`;

/** @type {Sample[]} */
export const SAMPLES = [
  {
    key: "tb",
    kind: "tb",
    label: "A trial balance",
    what: "25 ledgers with last year beside this year — and a suspense balance nobody cleared.",
    file: TRIAL_BALANCE,
  },
  {
    key: "sales",
    kind: "sales",
    label: "A sales register",
    what: "18 invoices for one month, with a repeated number, a gap in the series and one dated outside it.",
    file: SALES_REGISTER,
  },
  {
    key: "bank",
    kind: "bank",
    label: "A bank statement",
    what: "A month of an overdraft account: salary, the statutory dues, two cash withdrawals and a returned cheque.",
    file: BANK_STATEMENT,
  },
];

/** @param {string} key */
export function sampleFor(key) {
  return SAMPLES.find((sample) => sample.key === key) ?? null;
}
