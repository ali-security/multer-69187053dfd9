/* eslint-env mocha */

var assert = require('assert')

var util = require('./_util')
var multer = require('../')
var FormData = require('form-data')

// @see https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm
//
// Two crafted text field names are enough to take the process down. The first
// one (`items[4294967294]`) makes append-field materialise a sparse array whose
// length is the JS maximum (4294967295); the second one (`items[]`) pushes onto
// that array and append-field throws `RangeError: Invalid array length`. The
// throw happens inside busboy's `field` handler, so it escapes as an uncaught
// exception instead of reaching the application's error handler.
//
// The sealed `fieldArrayIndexLimit` default (10000) already refuses the first
// field name, so with default limits the request is rejected with
// LIMIT_FIELD_ARRAY_INDEX before append-field is ever reached. Callers that opt
// back into the upstream unbounded behaviour (`fieldArrayIndexLimit: Infinity`)
// still hit append-field, and there the throw must surface as a MulterError
// with code INVALID_FIELD_NAME rather than crashing.

describe('crafted multipart field names', function () {
  it('should not crash when a field name overflows the maximum array length', function (done) {
    var form = new FormData()
    // items[4294967294] creates a sparse array with length 4294967295 (JS max);
    // items[] then pushes past it, which throws RangeError inside appendField.
    form.append('items[4294967294]', 'x')
    form.append('items[]', 'y')

    util.submitForm(multer().none(), form, function (err) {
      // The overflow must be handled (surfaced as an error), not crash the process.
      assert.ok(err, 'expected the request to be rejected with an error')
      // The sealed array-index default rejects the oversized index outright, so
      // the request never gets far enough to overflow the array.
      assert.strictEqual(err.code, 'LIMIT_FIELD_ARRAY_INDEX')
      done()
    })
  })

  it('should surface the array length overflow as INVALID_FIELD_NAME', function (done) {
    // Infinity restores the upstream (unbounded) array index behaviour, which
    // is the configuration in which append-field actually throws.
    var parser = multer({ limits: { fieldArrayIndexLimit: Infinity } }).none()
    var form = new FormData()

    form.append('items[4294967294]', 'x')
    form.append('items[]', 'y')

    util.submitForm(parser, form, function (err) {
      assert.ok(err, 'expected the request to be rejected with an error')
      assert.strictEqual(err.code, 'INVALID_FIELD_NAME')
      assert.strictEqual(err.field, 'items[]')
      assert.strictEqual(err.message, 'Invalid field name')
      assert.strictEqual(err.name, 'MulterError')
      done()
    })
  })

  it('should surface the overflow when it is nested behind object keys', function (done) {
    var parser = multer({ limits: { fieldArrayIndexLimit: Infinity } }).none()
    var form = new FormData()

    form.append('a[b][4294967294]', 'x')
    form.append('a[b][]', 'y')

    util.submitForm(parser, form, function (err) {
      assert.ok(err, 'expected the request to be rejected with an error')
      assert.strictEqual(err.code, 'INVALID_FIELD_NAME')
      assert.strictEqual(err.field, 'a[b][]')
      done()
    })
  })

  it('should still append ordinary array fields', function (done) {
    var form = new FormData()

    form.append('items[]', 'x')
    form.append('items[]', 'y')

    util.submitForm(multer().none(), form, function (err, req) {
      assert.ifError(err)
      assert.deepStrictEqual(req.body.items, ['x', 'y'])
      done()
    })
  })
})
