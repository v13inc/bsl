#!/usr/bin/env node

var bsl = require('./index');

// exec stdin
var execStdin = function() {
  // why does node make this so hard?!
  // I just wanna execute some stdin, geez
  var stdin = '';
  process.stdin.on('readable', function() {
    var chunk = process.stdin.read();
    if(chunk !== null) stdin += chunk;
  });
  process.stdin.on('end', function() {
    bsl.exec(stdin);
    if(R.S.length) console.log(bsl.R.S.pop());
  });
}

var execArgs = function() { bsl.exec(process.argv.slice(2).join(' ')) };
var repl = function() {
  require('repl').start({ 
    eval: function(cmd, context, filename, callback) {
      var code = cmd.replace(/[(\)]/g, '').trim();
      bsl.exec(code);
      callback(null, [].map.call(bsl.R.S, function(o) { return o.toString() }));
    } 
  });
}

if(process.argv.length > 2) {
  execArgs();
  if(bsl.R.S.length) console.log(bsl.R.S.pop());
} else {
  //console.log(bsl.parse('1\'2 3 4\'; 5 "6 7" 8\n9 10 11 12 `hello-world'));
  //bsl.exec('print "Hello, World!" print / * 8 + 1 2 2');
  bsl.exec('set `foo "bar"; print foo; set `foo "baz"; print foo');
  repl();
}
