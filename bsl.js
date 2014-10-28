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

// Base types (obj._t): word (w), deferred (d), string (s), function (f), block (b), table (t)
var disps = {
  w: function(w) { return w.toString() },
  d: function(d) { return '`' + disp(d, d._d) },
  s: function(s) { return '"' + s.toString().replace(/"/g, '\\"') + '"' },
  f: function(f) { return '{}' },
  t: function(t) { return '[' + [].map.call(t, function(r) { return [].map.call(r, function(c) { return disp(c) }).join(' ') }).join(', ') + ']' },
}
var disp = function(word, type) { return disps[type || word._t || 'w'](word) };
var logStack = function(stack) { 
  if(stack.length) console.log('\n' + stack.map(function(i) { return disp(i) }).join('\n'));
}

var execArgs = function() { bsl.exec(process.argv.slice(2).join(' ')) };
var repl = function() {
  require('repl').start({ 
    prompt: '    ',
    ignoreUndefined: true,
    eval: function(cmd, context, filename, callback) {
      var code = cmd.replace(/[(\)]/g, '').trim();
      bsl.exec(code);
      logStack(bsl.R.S);
      callback(null);
    } 
  });
}

if(process.argv.length > 2) {
  execArgs();
  if(bsl.R.S.length) console.log(bsl.R.S.pop());
} else {
  //console.log(bsl.parse('1\'2 3 4\'; 5 "6 7" 8\n9 10 11 12 `hello-world'));
  //bsl.exec('print "Hello, World!" print / * 8 + 1 2 2');
  bsl.exec('set `foo "bar"; print foo; set `foo "baz"; print foo; print pow 5 2; print charAt "1234" 1');
  bsl.exec('print [1 2 3 4,5 6 7 8]');
  repl();
}
