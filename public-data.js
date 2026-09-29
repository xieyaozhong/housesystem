window.HOUSE_PUBLIC_DATA = {
  version: 1,
  updated_at: "2026-09-29T11:18:00+08:00",
  mode: "public-readonly",
  vacancies: [
    { room: "北屯8B", address: "台中市北區北屯路45號（8樓）", source: "既有空房" },
    { room: "北屯8C", address: "台中市北區北屯路45號（8樓）", source: "既有空房" },
    { room: "陝西703", address: "台中市陝西四街54號", source: "既有空房" },
    { room: "民生303", address: "台中市西區民生路467號3樓", source: "既有空房" },
    { room: "寧夏R8", address: "台中市西屯區寧夏路79號8樓", source: "既有空房" },
    { room: "復興路五段186號3樓E室", address: "台中市東區復興路五段186號3樓之5", source: "既有空房" },
    { room: "一中4A", address: "台中市北區一中街133號", source: "退租轉空房", since: "2026-09-11" },
    { room: "明德6D", address: "台中市南區明德街66號", source: "退租轉空房", since: "2026-09-29" }
  ],
  rented: [
    { room: "梅亭503", address: "台中市北區梅亭街171號503", updated_at: "2026-09-23" },
    { room: "一中7B", address: "台中市北區一中街133號7樓", updated_at: "2026-09-23" },
    { room: "太原C", address: "台中市北區太原路二段215巷1弄8之3號4樓", updated_at: "2026-09-23" },
    { room: "精誠301", address: "台中市西區精誠十八街33號3樓", updated_at: "2026-09-29" }
  ],
  checkouts: [
    {
      room: "一中4A",
      address: "台中市北區一中街133號",
      checkout_date: "2026-09-11",
      refund_amount: 22079,
      refund_due_date: "2026-09-15",
      refund_status: "paid",
      refund_paid_date: "2026-09-29",
      note: "存電 15.7 度 × 5 元 = 78.5 元，計 79 元；押金 22,000 元＋79 元＝應退 22,079 元"
    },
    {
      room: "明德6D",
      address: "台中市南區明德街66號",
      checkout_date: "2026-09-29",
      refund_amount: 8625,
      refund_due_date: "2026-10-06",
      refund_status: "pending",
      note: "本期電 14754－上期電 14679＝75 度；75 × 5 元＝375 元；押金 9,000 元－375 元＝應退 8,625 元"
    }
  ],
  weekly_accounts: [
    {
      id: "refund-yizhong-4a",
      kind: "refund",
      party: "退租房客",
      property_label: "一中4A",
      amount: 22079,
      settlement_date: "2026-10-02",
      status: "paid",
      paid_date: "2026-09-29",
      description: "退租退款｜押金 22,000 元＋存電 79 元",
      bank_display: "銀行 700｜帳號末四碼 4190"
    },
    {
      id: "refund-mingde-6d",
      kind: "refund",
      party: "退租房客",
      property_label: "明德6D",
      amount: 8625,
      settlement_date: "2026-10-02",
      due_date: "2026-10-06",
      status: "pending",
      description: "退租退款｜押金 9,000 元－電費 375 元",
      bank_display: "銀行 807｜帳號末四碼 5588"
    }
  ]
};
