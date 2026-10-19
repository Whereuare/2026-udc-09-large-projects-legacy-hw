/**
 * Added after a mutation run (docs/task-e-bonus.md): pins what the golden files
 * could not reach because the seeded data has no drafts and no orphan invoices,
 * and that the dates do not depend on the server's time zone.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var format = require('../../lib/format');
var accounting = require('../../lib/export/accounting');

var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001' };

function inv(over) {
  return Object.assign({
    number: 'INV-2026-00099', issued_at: '2026-03-09', due_at: '2026-03-23', customer_id: 1,
    subtotal_kopecks: 100000, vat_kopecks: 20000, total_kopecks: 120000, status: 'issued',
  }, over);
}

test('export skips drafts but keeps cancelled and paid invoices', function () {
  var file = accounting.buildAccountingFile(
    [inv({ number: 'A', status: 'draft' }), inv({ number: 'B', status: 'cancelled' }), inv({ number: 'C', status: 'paid' })],
    { 1: customer },
  );
  var rows = file.split('\r\n');
  assert.equal(rows.length, 4); // header, B, C, trailing empty
  assert.match(rows[1], /^B;03\/09\/2026;03\/23\/2026;10000001;/);
  assert.match(rows[2], /^C;/);
});

test('export of an invoice with an unknown customer: empty ЄДРПОУ and name, not a crash', function () {
  var file = accounting.buildAccountingFile([inv({ customer_id: 404 })], {});
  assert.equal(file.split('\r\n')[1], 'INV-2026-00099;03/09/2026;03/23/2026;;;1000.00;200.00;1200.00');
});

test('dates do not depend on the server time zone', function () {
  var old = process.env.TZ;
  ['America/Los_Angeles', 'Pacific/Kiritimati', 'Europe/Kyiv'].forEach(function (tz) {
    process.env.TZ = tz;
    assert.equal(format.formatDate('2026-03-09'), '03/09/2026', tz);
    assert.equal(format.formatDateUA('2026-03-09'), '09.03.2026', tz);
  });
  if (old === undefined) delete process.env.TZ; else process.env.TZ = old;
});
