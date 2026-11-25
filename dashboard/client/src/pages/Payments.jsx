import React, { useEffect, useState } from "react";
import { Search, Receipt, ChevronDown, Timer, CreditCard, Banknote, Landmark, Smartphone } from "lucide-react";
import { api, rs, date, ago } from "../api.js";
import { Card, Field, Button, Empty, Badge, Confirm, Progress, Table, useToast } from "../ui.jsx";

const METHODS = [{ id: "cash", label: "Cash", icon: Banknote }, { id: "card", label: "Card", icon: CreditCard },
  { id: "bank_transfer", label: "Bank", icon: Landmark }, { id: "mobile_wallet", label: "Wallet", icon: Smartphone }];

export default function Payments({ ctx }) {
  const toast = useToast();
  const [no, setNo] = useState(ctx.bill_no || ""); const [d, setD] = useState(null); const [err, setErr] = useState(""); const [finding, setFinding] = useState(false);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState("cash");
  const [adv, setAdv] = useState(false); const [key, setKey] = useState(""); const [fail, setFail] = useState(false);
  const [confirm, setConfirm] = useState(false); const [paying, setPaying] = useState(false); const [receipt, setReceipt] = useState(null);
  const [session, setSession] = useState(null); const [now, setNow] = useState(Date.now());
  useEffect(() => { if (ctx.bill_no) load(ctx.bill_no); }, [ctx]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  function load(n = no) {
    if (!n.trim()) return setErr("Enter a bill number");
    setFinding(true); setErr("");
    return api("/bill/" + n.trim()).then((x) => { setD(x); setAmount(String(x.bill.balance)); }).catch((e) => { setD(null); setErr(e.message); }).finally(() => setFinding(false));
  }
  const b = d?.bill; const a = Number(amount);
  const amtErr = !amount ? "" : !(a > 0) ? "Enter an amount above 0" : b && a > b.balance + 0.004 ? `Cannot exceed the balance of ${rs(b.balance)}` : "";

  async function pay() {
    setPaying(true);
    try {
      const r = await api("/payments", { bill_no: b.bill_no, amount: a, method, idempotency_key: key || undefined, simulate_failure: fail });
      setReceipt(r); toast("success", "Payment recorded", `${r.receipt_no} · ${rs(r.amount)}`);
      await load(b.bill_no);
    } catch (e) {
      toast("error", fail ? "Transaction rolled back" : "Payment rejected", e.message + (fail ? " — bill, balance and receipt are unchanged." : ""));
      await load(b.bill_no);
    } finally { setPaying(false); setConfirm(false); }
  }
  async function startSession() {
    try { const s = await api("/sessions", { bill_no: b.bill_no, ttl_seconds: 60 }); setSession(s); toast("info", "Payment session started", "It expires in 60 s and is then deleted by the TTL index."); }
    catch (e) { toast("error", "Could not start session", e.message); }
  }
  const left = session ? Math.max(0, Math.round((new Date(session.expires_at) - now) / 1000)) : 0;

  return (
    <div className="grid-1-1">
      <div className="stack">
        <Card title="Find the bill">
          <form className="row" onSubmit={(e) => { e.preventDefault(); setReceipt(null); load(); }}>
            <Field label="Bill number" hint="Tip: open a consumer and click Pay next to a bill" error={err}>
              <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="B-2026-10-000123" autoFocus /></Field>
            <Button type="submit" loading={finding}><Search size={16} /> Find</Button>
          </form>
          {b && <div className="bill-sum">
            <div className="row between"><div><b>{b.bill_no}</b><span className="muted"> · {d.consumer?.name} · {b.period}</span></div><Badge status={b.status} /></div>
            <Progress value={b.amount_paid} max={b.total} />
            <div className="three"><div><span>Total</span><b>{rs(b.total)}</b></div><div><span>Paid</span><b className="green">{rs(b.amount_paid)}</b></div><div><span>Balance</span><b className={b.balance > 0 ? "red" : ""}>{rs(b.balance)}</b></div></div>
            <p className="muted small">Due {date(b.due_date)}{b.charges.late_fee > 0 && ` · includes late fee ${rs(b.charges.late_fee)}`}</p>
          </div>}
        </Card>

        {b && <Card title="Take payment">
          {b.balance <= 0 ? <Empty icon={Receipt} title="This bill is fully paid" hint="No further payments can be applied." /> : <>
            <Field label="Amount (Rs)" error={amtErr}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <div className="chips">
              <button type="button" onClick={() => setAmount(String(b.balance))}>Full balance</button>
              <button type="button" onClick={() => setAmount(String(Math.round(b.balance / 2)))}>Half</button>
              <button type="button" onClick={() => setAmount("1000")}>Rs 1,000</button></div>
            <span className="lbl">Method</span>
            <div className="seg" role="radiogroup">{METHODS.map((m) => { const I = m.icon; return (
              <button type="button" role="radio" aria-checked={method === m.id} key={m.id} className={method === m.id ? "on" : ""} onClick={() => setMethod(m.id)}><I size={16} />{m.label}</button>); })}</div>

            <button type="button" className="disclose" onClick={() => setAdv(!adv)} aria-expanded={adv}><ChevronDown size={16} className={adv ? "rot" : ""} /> Demo options (concurrency & rollback)</button>
            {adv && <div className="adv">
              <Field label="Idempotency key" hint="Reuse a key to show duplicate requests are blocked"><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auto-generated if empty" /></Field>
              <label className="check"><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} /> Simulate a failure after the bill update (shows rollback)</label>
            </div>}
            <div className="row">
              <Button disabled={!amount || !!amtErr} onClick={() => setConfirm(true)} variant={fail ? "danger" : "primary"}>Review payment</Button>
              <Button variant="ghost" onClick={startSession}><Timer size={16} /> Start 60 s session</Button>
            </div>
            {session && <div className={"session" + (left === 0 ? " exp" : "")}><Timer size={16} />
              {left > 0 ? <>Session <code>{session.token.slice(0, 10)}…</code> expires in <b>{left}s</b></> : <>Session expired — MongoDB's TTL monitor removes it within ~60 s</>}</div>}
          </>}
        </Card>}
      </div>

      <div className="stack">
        {receipt && <Card className="receipt">
          <div className="r-head"><Receipt size={22} /><div><b>Receipt {receipt.receipt_no}</b><span>{new Date(receipt.paid_at).toLocaleString()}</span></div></div>
          <div className="big-amount">{rs(receipt.amount)}</div>
          <p className="muted cap">{receipt.method.replace("_", " ")} · bill {b?.bill_no}</p>
        </Card>}
        <Card title="Payment history" subtitle={b ? b.bill_no : "Find a bill to see its payments"}>
          {!b ? <Empty icon={Receipt} title="No bill selected" /> :
            <Table rows={d.payments} empty="No payments yet" cols={[
              { k: "receipt_no", label: "Receipt" }, { k: "amount", label: "Amount", num: true, render: (p) => rs(p.amount) },
              { k: "method", label: "Method", render: (p) => <span className="cap">{p.method.replace("_", " ")}</span> },
              { k: "paid_at", label: "When", render: (p) => ago(p.paid_at) }]} />}
        </Card>
      </div>

      <Confirm open={confirm} title={fail ? "Run failure simulation?" : "Confirm payment"} confirmText={fail ? "Run simulation" : `Pay ${rs(a)}`} danger={fail}
        loading={paying} onCancel={() => setConfirm(false)} onConfirm={pay}>
        <dl className="totals">
          <div><dt>Bill</dt><dd>{b?.bill_no}</dd></div><div><dt>Consumer</dt><dd>{d?.consumer?.name}</dd></div>
          <div><dt>Method</dt><dd className="cap">{method.replace("_", " ")}</dd></div>
          <div className="grand"><dt>Amount</dt><dd>{rs(a)}</dd></div>
          <div><dt>Balance after</dt><dd>{rs((b?.balance || 0) - a)}</dd></div></dl>
        {fail && <p className="warn">The transaction will fail on purpose after updating the bill. Nothing should be saved.</p>}
      </Confirm>
    </div>
  );
}
