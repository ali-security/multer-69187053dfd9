/* eslint-env mocha */

var assert = require('assert')

var util = require('./_util')
var multer = require('../')
var FormData = require('form-data')

// Walks the parsed body breadth-first (never recursively, so the walker itself
// cannot overflow the stack) and reports how deep the structure got.
function bodyDepth (body) {
  var depth = 0
  var level = [body]

  while (level.length > 0) {
    var next = []

    for (var i = 0; i < level.length; i++) {
      var node = level[i]
      if (node === null || typeof node !== 'object') continue

      var keys = Object.keys(node)
      for (var j = 0; j < keys.length; j++) next.push(node[keys[j]])
    }

    if (next.length === 0) break

    depth++
    level = next
  }

  return depth
}

describe('Field name nesting depth', function () {
  // @see https://github.com/expressjs/multer/security/advisories/GHSA-72gw-mp4g-v24j

  it('should reject field names exceeding fieldNestingDepth (array brackets)', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: 10 } }).none()
    var form = new FormData()

    form.append('a' + '[0]'.repeat(11), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      done()
    })
  })

  it('should reject field names exceeding fieldNestingDepth (object brackets)', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: 10 } }).none()
    var form = new FormData()

    form.append('a' + '[key]'.repeat(11), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      done()
    })
  })

  it('should allow field names at exactly the nesting depth limit', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: 3 } }).none()
    var form = new FormData()

    form.append('a[0][1][2]', 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ifError(err)
      assert.strictEqual(req.body.a[0][1][2], 'value')
      done()
    })
  })

  it('should reject deeply nested field names by default', function (done) {
    var parser = multer().none()
    var form = new FormData()

    form.append('a' + '[0]'.repeat(100), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      done()
    })
  })

  it('should allow nesting within the default depth', function (done) {
    var parser = multer().none()
    var form = new FormData()

    form.append('a[0][1][2]', 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ifError(err)
      assert.strictEqual(req.body.a[0][1][2], 'value')
      done()
    })
  })

  it('should allow unlimited nesting when fieldNestingDepth is Infinity', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: Infinity } }).none()
    var form = new FormData()

    form.append('a' + '[0]'.repeat(100), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ifError(err)
      done()
    })
  })

  it('should apply the default limit at exactly 32 levels of nesting', function (done) {
    var parser = multer().none()
    var form = new FormData()

    form.append('a' + '[0]'.repeat(32), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ifError(err)
      // 32 bracket levels plus the leaf value itself
      assert.strictEqual(bodyDepth(req.body), 33)
      done()
    })
  })

  it('should reject one level beyond the default limit', function (done) {
    var parser = multer().none()
    var form = new FormData()

    form.append('a' + '[0]'.repeat(33), 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      done()
    })
  })

  // The advisory's exploit: a single request whose field name carries as much
  // bracket nesting as fits in a multipart part header. Unpatched, append-field
  // happily materialises the whole chain, so the body ends up thousands of
  // levels deep and any recursive traversal of it blows the stack.
  it('should not build an unbounded body from a single crafted request (array brackets)', function (done) {
    var fieldname = 'a' + '[0]'.repeat(4000)
    var parser = multer().none()
    var form = new FormData()

    form.append(fieldname, 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      assert.strictEqual(err.field, fieldname)
      assert.strictEqual(bodyDepth(req.body), 0)
      JSON.stringify(req.body)
      done()
    })
  })

  it('should not build an unbounded body from a single crafted request (object brackets)', function (done) {
    var fieldname = 'a' + '[k]'.repeat(4000)
    var parser = multer().none()
    var form = new FormData()

    form.append(fieldname, 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      assert.strictEqual(err.field, fieldname)
      assert.strictEqual(bodyDepth(req.body), 0)
      JSON.stringify(req.body)
      done()
    })
  })

  it('should report a descriptive message for the nesting limit', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: 2 } }).none()
    var form = new FormData()

    form.append('a[0][1][2]', 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'should have returned an error')
      assert.strictEqual(err.code, 'LIMIT_FIELD_NESTING')
      assert.strictEqual(err.message, 'Field name nesting too deep')
      assert.strictEqual(err.name, 'MulterError')
      done()
    })
  })

  it('should allow flat field names with fieldNestingDepth set', function (done) {
    var parser = multer({ limits: { fieldNestingDepth: 1 } }).none()
    var form = new FormData()

    form.append('simple', 'value')

    util.submitForm(parser, form, function (err, req) {
      assert.ifError(err)
      assert.strictEqual(req.body.simple, 'value')
      done()
    })
  })
})
