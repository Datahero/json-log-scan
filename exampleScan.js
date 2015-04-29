var LogScan = require('./LogScan');

var scan = new LogScan({
  filename: '/Users/dlopuch/Downloads/log.json',
  from: '2014-04-24T20:55',
  until: '2014-04-24T21:57:50',
  fields: [
    'timestamp', 
    'level', 
    'session_id', 
    'user_id', 
    'message', 
    'error', 
    function(r) { return r.firstName + ' ' + r.lastName; }
  ],

  // Output into tabbed console spacing.  Comment this out to use default CSV output
  output: 'consoleTabbed', // specifies an existing key, or a function to make your own

  // True to skip status messages / summary statistics (eg if generating a straight CSV)
  quiet: true
});

// start it
scan.scan();
