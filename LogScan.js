var fs = require('fs'),
    readline = require('readline'),
    Stream = require('stream'),
    _ = require('lodash');

/**
 * Create a new log scanner.  Call additional function or .scan() to scan the log.
 * @param {Object} options:
 *   filename: {string} File to open
 *   [from]: {string | Date} Automatically add a 'timestamp-must-be-on-or-after Date' filter
 *   [until]: {string | Date} Automatically add a 'timestamp-must-be-on-or-before Date' filter
 *   [fields]: {Array(string | function(Object))} List of fields to display.
 *               If accessor function, gets passed the full record as first param
 *               If string, can be a multi-level dot-separated accessor ('foo.bar.baz').  Null references are
 *               handled gracefully ('foo.oops.nonexistant' --> null)
 */
var LogScan = function(opts) {
  if (!opts.filename)
    throw new Error('filename required in options');

  this.filename = opts.filename;
  this.filters = [];
  this.fields = [];
  this.mappers = [];
  this.output = LogScan.OUTPUTS[opts.output] || LogScan.OUTPUTS.csv;
  this.quiet = !!opts.quiet;


  if (opts.from || opts.until) {
    this.filter(LogScan.FILTERS.timestamp({from: opts.from, until: opts.until}));
  }

  if (opts.fields)
    this.addFields(opts.fields);
};

/**
 * @private
 *
 * Utility that returns an accessor function based on an accessor str, eg:
 *
 *   var foo = {bar: {baz: {boom: 'got it'} } },
 *       accessor;
 *
 *   accessor = str2Accessor('bar.baz.boom');
 *   accessor(foo); // --> 'got it'
 *
 *   accessor = str2Accessor('bar');
 *   accessor(foo); // --> { baz: { boom: 'got it' } }
 *
 *   accessor = str2Accessor('bar.oops.boom');
 *   accessor(foo); // --> null
 */
function str2Accessor(accessorStr) {
  var accessors = accessorStr.split('.');

  // If direct, just grab it.
  if (accessors.length === 1)
    return function(o) { return o[accessorStr]; };

  // Otherwise, iterate through accessors until we get a null
  return function(o) {
    for (var i=0; i < accessors.length; i++) {
      if (o === undefined || o === null) {
        return null;
      }
      o = o[accessors[i]];
    }
    return o === undefined ? null : o;
  };
};


/**
 * Add fields to the output
 * @param {string | function(record) | Array(string | function(record))} fields field or fields to output from the
 *          record, eg 'timestamp', 'foo.bar.baz', function(r) {return r.level === 'error' ? '!!!PANIC!!!' : r.level; }
 */
LogScan.prototype.addFields = function(fields) {
  if (!Array.isArray(fields)) {
    fields = [fields];
  }

  if (!this._fieldKeys) {
    this._fieldKeys = [];
  }

  // Turn every field into an accessor function (including dot-separated accessors "foo.bar.baz")
  var self = this;
  fields = fields.map(function(f) {
    self._fieldKeys.push(f.toString());
    if (_.isFunction(f))
      return f;
    else if (_.isString(f))
      return str2Accessor(f);
    else
      throw new Error('Unknown field type: ' + f);
  });

  this.fields = this.fields.concat(fields);

  return this;
};

/**
 * Add a filter per Array.filter API.  Only records passing the filter will be shown.
 * @param {function(record)} filter Function that returns true if the {Object} record should 'pass', false otherwise.
 */
LogScan.prototype.filter = function(filter) {
  if (typeof filter !== 'function')
    throw new Error('Only filter by functions!');

  this.filters.push(filter);

  return this;
};

LogScan.prototype.map = function(mapFn) {
  if (typeof mapFn !== 'function')
    throw new Error('Only map by functions!');

  this.mappers.push(mapFn);

  return this;
};

/**
 * Perform the log scan, sending each line to the outputter (defaults to console logging).
 *
 * If no fields have been added, defaults to 'timestamp', 'level', 'message'
 */
LogScan.prototype.scan = function() {
  var rl = readline.createInterface(
    fs.createReadStream(this.filename, 'r'),
    new Stream
  );

  if (!this.fields.length) {
    this.addFields(['timestamp', 'level', 'message']);
  }

  var lineCount = 0;
  var outputCount = 0;
  var self = this;

  if (!this.quiet)
    console.log('Starting scan...');

  rl.on('close', function() {
    if (!self.quiet)
      console.log("Done.  Scanned " + lineCount + " lines, output " + outputCount);
  });

  var columnHeadersRecord = {};
  this.fields.forEach(function (f, i) {
    columnHeadersRecord[ self._fieldKeys[i] ] = self._fieldKeys[i];
  });
  this.output.call(this, columnHeadersRecord);


  var record,
      passedFilters;

  rl.on('line', function(line) {
    record = JSON.parse(line);

    record._line = ++lineCount;

    passedFilters = true;
    for (var i = 0; i<this.filters.length; i++) {
      if (this.filters[i](record) === false) {
        passedFilters = false;
        break;
      }
    }

    // If it passed the filters, do the mappers
    if (passedFilters) {

      for (var i = 0; i<this.mappers.length; i++) {
        record = this.mappers[i](record, outputCount);
      }

      this.output.call(this, record);
      outputCount++;
    }

  }.bind(this));

  return this;
};

LogScan.OUTPUTS = {
  consoleTabbed: function(r) {
    console.log.apply(console, this.fields.map(function(f) { return f(r); }));
  },

  stringify: function(r) {
    console.log(JSON.stringify(r));
  },

  csv: function(r) {
    console.log(this.fields.map(function(f) {
                  if (typeof f(r) === 'string' && (f(r).indexOf(',') > -1 || f(r).indexOf('\n') > -1))
                    return '"' + f(r).replace(/"/g, '\\"') + '"';
                  return f(r);
                })
                .join(','));
  }
};

LogScan.FILTERS = {
  timestamp: function(opts) {
    if (!opts.from && !opts.until)
      throw new Error("Need either .from or .until");

    if (typeof opts.from === 'string')
      opts.from = new Date(opts.from);

    if (typeof opts.until === 'string')
      opts.until = new Date(opts.until);

    return function(r) {
      var d = typeof r.timestamp === 'string' ? new Date(r.timestamp) : r.timestamp;
      var good = true;
      if (opts.from)
        good = d >= opts.from;
      if (good && opts.until)
        good = d <= opts.until;

      return good;

    };
  }
};

module.exports = LogScan;

