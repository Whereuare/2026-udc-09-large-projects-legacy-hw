/**
 * Characterization tests for BILL-482 (Task B): pin what every consumer of
 * lib/format.js formatDate() prints TODAY, before the change.
 *
 * Golden files in ./golden were produced from the unchanged code. Do not
 * regenerate them to make a test pass: a red test here means an output changed,
 * and the question is whether it was MEANT to change (see docs/impact.md).
 *
 *   human readers:   invoice HTML, reminder mails
 *   machine reader:  the Облік-Плюс CSV (must stay byte-for-byte)
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var http = require('http');
var store = require('../../lib/store');
var format = require('../../lib/format');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');
var createServer = require('../../server').createServer;

var GOLDEN = path.join(__dirname, 'golden');

function golden(name) {
  return fs.readFileSync(path.join(GOLDEN, name));
}

function byId(rows) {
  var m = {};
  rows.forEach(function (r) { m[r.id] = r; });
  return m;
}

function loadAll(cb) {
  store.all('customers', function (err, customers) {
    if (err) return cb(err);
    store.all('invoices', function (err2, invoices) {
      cb(err2, customers, invoices);
    });
  });
}

function get(server, p, cb) {
  http.get({ port: server.address().port, path: p }, function (res) {
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () { cb(null, res.statusCode, Buffer.concat(chunks)); });
  }).on('error', cb);
}

test('formatDate today: MM/DD/YYYY (the function the ticket is about)', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-03'), '12/03/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate('not a date'), '');
});

test('invoice HTML over HTTP (GET /invoices/:number) prints MM/DD/YYYY dates', function (t, done) {
  var server = createServer();
  server.listen(0, function () {
    get(server, '/invoices/INV-2026-00007', function (err, status, body) {
      server.close();
      assert.ifError(err);
      assert.equal(status, 200);
      assert.equal(body.toString('utf8'), golden('invoice-INV-2026-00007.html').toString('utf8'));
      assert.match(body.toString('utf8'), /Дата: <b>03\/07\/2026<\/b> · Сплатити до: <b>03\/21\/2026<\/b>/);
      done();
    });
  });
});

test('invoice HTML via bin/render-invoice.js path (renderInvoiceHtml) is the same page', function (t, done) {
  loadAll(function (err, customers, invoices) {
    assert.ifError(err);
    var inv = invoices.filter(function (i) { return i.number === 'INV-2026-00031'; })[0];
    var html = require('../../lib/invoices/render').renderInvoiceHtml(inv, byId(customers)[inv.customer_id]);
    assert.equal(html, golden('invoice-INV-2026-00031.html').toString('utf8'));
    done();
  });
});

test('reminder mails (upcoming + overdue) print MM/DD/YYYY due dates', function (t, done) {
  loadAll(function (err, customers, invoices) {
    assert.ifError(err);
    var mails = reminders.buildReminders(invoices, byId(customers), '2026-03-16');
    assert.deepEqual(mails, JSON.parse(golden('reminders-2026-03-16.json').toString('utf8')));
    var kinds = mails.map(function (m) { return m.kind; });
    assert.ok(kinds.indexOf('upcoming') !== -1 && kinds.indexOf('overdue') !== -1, 'both kinds are covered');
    mails.forEach(function (m) { assert.match(m.text, /\d\d\/\d\d\/2026/); });
    done();
  });
});

test('accounting export (read by Облік-Плюс) is byte-for-byte this file', function (t, done) {
  loadAll(function (err, customers, invoices) {
    assert.ifError(err);
    var out = Buffer.from(accounting.buildAccountingFile(invoices, byId(customers)), 'utf8');
    assert.ok(out.equals(golden('oblik-export.csv')), 'export bytes changed');
    var lines = out.toString('utf8').split('\r\n');
    assert.equal(lines[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');
    assert.match(lines[1], /^INV-2026-00001;03\/01\/2026;03\/15\/2026;/);
    done();
  });
});
