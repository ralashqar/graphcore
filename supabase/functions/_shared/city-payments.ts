type Order = { id: string; amount: number | string };
type Session = {
  metadata?: { city_order_id?: string };
  currency: string;
  amount_subtotal: number;
  amount_total: number;
  status: string;
  payment_status: string;
  payment_intent: string | null;
};
type Intent = {
  status: string;
  latest_charge: {
    currency: string;
    amount: number;
    amount_refunded: number;
  } | null;
};
export function paymentState(
  order: Order,
  session: Session,
  intent: Intent | null,
  disputes: { status: string }[] = [],
) {
  const amount = Number(order.amount);
  if (
    session.metadata?.city_order_id !== order.id ||
    session.currency !== "gbp" ||
    session.amount_subtotal !== amount
  )
    throw new Error("Checkout amount, currency or order mismatch.");
  if (session.payment_status !== "paid")
    return {
      effective: 0,
      status: session.status === "expired" ? "expired" : "pending",
      intentId: session.payment_intent,
    };
  const charge = intent?.latest_charge;
  if (
    !session.payment_intent ||
    intent?.status !== "succeeded" ||
    !charge ||
    charge.currency !== "gbp" ||
    charge.amount !== session.amount_total ||
    charge.amount <= 0 ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount
  )
    throw new Error("Payment is not confirmed.");
  const held = disputes.some(
    (d) => !["won", "warning_closed"].includes(d.status),
  );
  const effective = held
    ? 0
    : Math.max(
        0,
        amount - Math.ceil((amount * charge.amount_refunded) / charge.amount),
      );
  return {
    effective,
    status: held
      ? "disputed"
      : charge.amount_refunded > 0
        ? effective
          ? "partially_refunded"
          : "refunded"
        : "fulfilled",
    intentId: session.payment_intent,
  };
}
