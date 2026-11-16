export const DEFAULT_STATE = {
  activeTab: 'walgreens',
  wgActiveId: 'wg-bo-520',
  wgScenarios: [
    {
      id: 'wg-bo-520',
      name: 'Bo 520',
      taxRate: 0.086,
      spendReq: 30,
      boosterGet: 0,
      rows: [
        { product: 'head', price: 7, count: 2, taxable: 1, percentage: 1, mfc: 3, ivc: 8, wc: 0, rr: 4, ibotta: 0, other: 0 },
        { product: 'Oral', price: 6, count: 2, taxable: 1, percentage: 1, mfc: 6, ivc: 0, wc: 0, rr: 5, ibotta: 0, other: 0 },
        { product: 'Scott', price: 5, count: 1.5, taxable: 1, percentage: 1, mfc: 2, ivc: 0, wc: 0, rr: 0, ibotta: 0, other: 0 }
      ]
    }
  ],
  cvsActiveId: 'cvs-bo-1',
  cvsScenarios: [
    {
      id: 'cvs-bo-1',
      name: 'Bo-1',
      taxRate: 0.086,
      rows: [
        { product: 'Crest', price: 10.79, count: 2, percentage: 1, mfr: 10, crt: 5, eb: 7, ibotta: 0, other: 0 },
        { product: 'Neutr wipes', price: 7.98, count: 1, percentage: 1, mfr: 4, crt: 0, eb: 3, ibotta: 0, other: 0 }
      ]
    }
  ],
  frys: {
    accounts: [
      { id: 'acc1', email: 'pidan520499', phone: '5204996666' },
      { id: 'acc2', email: '290861673', phone: '5204991111' },
      { id: 'acc3', email: 'pidan8074', phone: '5204992222' },
      { id: 'acc4', email: 'bogong2016', phone: '5204993333' },
      { id: 'acc5', email: 'starfromaz', phone: '6028421447' },
      { id: 'acc6', email: 'bostnhome', phone: '6028421440' },
      { id: 'acc7', email: '', phone: '5204998074' },
      { id: 'acc8', email: '', phone: '5204427196' }
    ],
    deals: [
      {
        id: 'd1',
        name: 'Free colgate',
        status: {
          acc1: { buy: false, receive: false }, acc2: { buy: false, receive: false },
          acc3: { buy: false, receive: false }, acc4: { buy: false, receive: false },
          acc5: { buy: false, receive: false }, acc6: { buy: false, receive: false },
          acc7: { buy: false, receive: false }, acc8: { buy: true, receive: true }
        }
      },
      {
        id: 'd2',
        name: 'Brawny $2',
        status: {
          acc1: { buy: false, receive: false }, acc2: { buy: false, receive: false },
          acc3: { buy: false, receive: false }, acc4: { buy: false, receive: false },
          acc5: { buy: false, receive: false }, acc6: { buy: false, receive: false },
          acc7: { buy: true, receive: true }, acc8: { buy: true, receive: true }
        }
      },
      {
        id: 'd3',
        name: 'Dove $3',
        status: {
          acc1: { buy: false, receive: false }, acc2: { buy: true, receive: false },
          acc3: { buy: false, receive: false }, acc4: { buy: false, receive: false },
          acc5: { buy: false, receive: false }, acc6: { buy: false, receive: false },
          acc7: { buy: true, receive: false }, acc8: { buy: true, receive: false }
        }
      },
      {
        id: 'd4',
        name: 'Viva cottoneLle',
        status: {
          acc1: { buy: false, receive: false }, acc2: { buy: true, receive: true },
          acc3: { buy: true, receive: true }, acc4: { buy: true, receive: true },
          acc5: { buy: false, receive: false }, acc6: { buy: false, receive: false },
          acc7: { buy: true, receive: true }, acc8: { buy: false, receive: false }
        }
      },
      {
        id: 'd5',
        name: 'Dove $2',
        status: {
          acc1: { buy: false, receive: false }, acc2: { buy: true, receive: false },
          acc3: { buy: true, receive: false }, acc4: { buy: true, receive: false },
          acc5: { buy: false, receive: false }, acc6: { buy: false, receive: false },
          acc7: { buy: true, receive: false }, acc8: { buy: true, receive: false }
        }
      }
    ]
  },
  reviewAccountFilter: 'Bo',
  reviews: [
    { id: 'r1', account: 'Bo', product: '打气', cost: 65.15, submitDate: '5/28', received: 65.58 },
    { id: 'r2', account: 'Bo', product: '风扇 $27.14', cost: 27.14, submitDate: '6/1', received: 32.35 },
    { id: 'r3', account: 'Bo', product: '猫喝水 $45.6', cost: 45.60, submitDate: '', received: 46.05 },
    { id: 'r4', account: 'Bo', product: '老鼠药', cost: 34.75, submitDate: '6/13', received: 45.20 },
    { id: 'r5', account: 'Bo', product: '洗牙套', cost: 54.29, submitDate: '6/30', received: 60.29 },
    { id: 'r6', account: 'Bo', product: '脖子按摩', cost: 49.74, submitDate: '7/15', received: 49.74 },
    { id: 'r7', account: 'Bo', product: '清洁猫毛', cost: 14.16, submitDate: '8/25', received: 21.95 },
    { id: 'r8', account: 'Bo', product: 'RING', cost: 32.72, submitDate: '', received: 32.72 },
    { id: 'r9', account: 'Bo', product: 'Groom', cost: 32.72, submitDate: '', received: 33.18 },
    { id: 'r10', account: 'Bo', product: 'Lamp', cost: 32.28, submitDate: '', received: 32.28 },
    { id: 'r11', account: 'Bo', product: '菜板', cost: 32.71, submitDate: '11/4', received: 32.71 },
    { id: 'r12', account: 'Bo', product: '超声波动物', cost: 37.08, submitDate: '11/4', received: 47.08 },
    { id: 'r13', account: 'Bo', product: '围脖', cost: 27.25, submitDate: '11/26', received: 23.98 },
    { id: 'r14', account: 'Bo', product: '搬家', cost: 12.97, submitDate: '', received: 11.26 },
    { id: 'r15', account: 'Bo', product: '蒸汽清洁', cost: 65.44, submitDate: '12/28', received: 65.44 },
    { id: 'r16', account: 'Bo', product: '吸尘器', cost: 32.72, submitDate: '1/20', received: 28.86 },
    { id: 'r17', account: 'Bo', product: '地毯', cost: 60.63, submitDate: '3/15', received: 43.24 },
    { id: 'r18', account: 'Bo', product: '猫爪毯子', cost: 18.40, submitDate: '3/21', received: 18.63 },
    { id: 'r19', account: 'Bo', product: '地毯', cost: 77.97, submitDate: '3/22', received: 61.91 },
    { id: 'r20', account: 'Bo', product: 'Magic glove', cost: 21.65, submitDate: '', received: 24.78 },
    { id: 'r21', account: 'Bo', product: 'Solar cleaner', cost: 112.62, submitDate: '', received: 112.82 },
    { id: 'r22', account: 'Bo', product: '泳池cell', cost: 444.02, submitDate: '', received: 369.00 },
    { id: 'r23', account: 'Bo', product: '猫屋groom', cost: 291.33, submitDate: '', received: 238.95 },
    { id: 'r24', account: 'Bo', product: 'Gym', cost: 195.22, submitDate: '', received: 162.35 },
    { id: 'r25', account: 'Bo', product: 'Pool', cost: 53.05, submitDate: '', received: 49.00 },
    { id: 'r26', account: 'Bo', product: 'Printer', cost: 38.00, submitDate: '', received: 29.09 },
    { id: 'r27', account: 'Bo', product: '架子', cost: 48.72, submitDate: '', received: 0 },
    { id: 'r28', account: 'Bo', product: 'Neck', cost: 32.48, submitDate: '', received: 32.75 },
    { id: 'r29', account: 'Bo', product: 'Lamp', cost: 49.80, submitDate: '', received: 49.96 },
    { id: 'r30', account: 'Star', product: 'Noorio', cost: 76.36, submitDate: '10/1', received: 66.62 },
    { id: 'r31', account: 'Star', product: '菜板', cost: 29.45, submitDate: '10/30', received: 29.91 },
    { id: 'r32', account: 'Star', product: 'storage', cost: 32.57, submitDate: '7/2', received: 32.76 },
    { id: 'r33', account: 'Star', product: 'barstool', cost: 335.72, submitDate: '3/21', received: 270.00 },
    { id: 'r34', account: 'Star', product: '蚊子refill', cost: 21.65, submitDate: '', received: 21.65 }
  ]
};