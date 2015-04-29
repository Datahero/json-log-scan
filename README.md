# json-log-scan
Quick Node script to progamatically parse and extract fields from JSON logs into TSV or CSV

Define the fields you want (or custom accessor functions) and scan a JSON log file to extract those fields. Record filters can be defined as well.

```javascript
(new LogScan({
  filename: '~/Downloads/log.json',
  from: '2015-04-24T20:55',
  until: '2015-04-24T21:57:50',
  fields: [
    'timestamp', 
    'level', 
    'message', 
    'user.nested.id',
    function(r) { return r.firstName + ' ' + r.lastName; }
  ],

  // Output into tabbed console spacing.  Comment this out to use default CSV output
  output: 'consoleTabbed', // specifies an existing key, or a function to make your own

  // True to skip status messages / summary statistics (eg if generating a straight CSV)
  quiet: true
}))
.scan();
```

# To Run:
1. `npm install`
2. Edit exampleScan.js
3. `node exampleScan.js`
