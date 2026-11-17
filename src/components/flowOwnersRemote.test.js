jest.mock('./config', () => ({ auth: {}, database: {} }));

const { buildFlowOwnersRestUrl } = require('./flowOwnersRemote');

describe('buildFlowOwnersRestUrl', () => {
  it('питає лише ключі кореня Flow (shallow) з квитком входу', () => {
    expect(buildFlowOwnersRestUrl('https://example-db.firebaseio.com', 'tok'))
      .toBe('https://example-db.firebaseio.com/multiData/flow.json?shallow=true&auth=tok');
  });

  it('лишає простір імен емулятора', () => {
    expect(buildFlowOwnersRestUrl('http://127.0.0.1:9099/?ns=webringitapp', 'tok'))
      .toBe('http://127.0.0.1:9099/multiData/flow.json?ns=webringitapp&shallow=true&auth=tok');
  });
});
